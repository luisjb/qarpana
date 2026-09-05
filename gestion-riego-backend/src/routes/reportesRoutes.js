const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const pool = require('../db');
const { verifyToken, isAdmin } = require('../middleware/auth');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// POST /api/reportes/enviar-pdf
// Body: { campoId, pdfBase64, nombreCampo, campañaNombre }
router.post('/enviar-pdf', verifyToken, isAdmin, async (req, res) => {
    const { campoId, pdfBase64, nombreCampo, campañaNombre } = req.body;

    if (!campoId || !pdfBase64) {
        return res.status(400).json({ error: 'campoId y pdfBase64 son requeridos' });
    }

    try {
        // Obtener los IDs de usuarios asociados al campo
        const campoResult = await pool.query(
            'SELECT usuarios_ids, usuario_id FROM campos WHERE id = $1',
            [campoId]
        );

        if (campoResult.rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }

        const campo = campoResult.rows[0];
        let usuariosIds = campo.usuarios_ids || [];
        if (usuariosIds.length === 0 && campo.usuario_id) {
            usuariosIds = [campo.usuario_id];
        }

        if (usuariosIds.length === 0) {
            return res.status(400).json({ error: 'El campo no tiene usuarios asociados' });
        }

        // Obtener emails de esos usuarios
        const usuariosResult = await pool.query(
            'SELECT nombre_usuario, email, nombre_completo FROM usuarios WHERE id = ANY($1) AND email IS NOT NULL AND email != \'\'',
            [usuariosIds]
        );

        const destinatarios = usuariosResult.rows;

        if (destinatarios.length === 0) {
            return res.status(400).json({
                error: 'Ningún usuario asociado al campo tiene email registrado. Agregue emails en la gestión de usuarios.'
            });
        }

        const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const asunto = `Informe Balance Hídrico — ${nombreCampo}${campañaNombre ? ` — Campaña ${campañaNombre}` : ''} — ${fecha}`;

        const pdfBuffer = Buffer.from(pdfBase64, 'base64');
        const nombreArchivo = `Informe_Balance_Hidrico_${(nombreCampo || 'campo').replace(/\s+/g, '_')}_${fecha.replace(/\//g, '-')}.pdf`;

        const toList = destinatarios.map(u => {
            const nombre = u.nombre_completo || u.nombre_usuario;
            return `${nombre} <${u.email}>`;
        });

        await transporter.sendMail({
            from: `"Qarpana - Balance Hídrico" <${process.env.SMTP_USER}>`,
            to: toList.join(', '),
            subject: asunto,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">
                    <div style="background:#2e7d32; padding:20px; border-radius:8px 8px 0 0;">
                        <h2 style="color:#fff; margin:0;">Informe Balance Hídrico</h2>
                    </div>
                    <div style="padding:24px; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 8px 8px;">
                        <p>Hola,</p>
                        <p>Adjunto encontrás el informe de balance hídrico correspondiente al campo <strong>${nombreCampo}</strong>${campañaNombre ? `, campaña <strong>${campañaNombre}</strong>` : ''}, generado el <strong>${fecha}</strong>.</p>
                        <p style="margin-top:24px; color:#666; font-size:13px;">Este mensaje fue enviado automáticamente desde el sistema de gestión de riego.</p>
                    </div>
                </div>
            `,
            attachments: [
                {
                    filename: nombreArchivo,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                },
            ],
        });

        res.json({
            message: `Informe enviado a ${destinatarios.length} destinatario${destinatarios.length !== 1 ? 's' : ''}`,
            destinatarios: destinatarios.map(u => u.email),
        });

    } catch (err) {
        console.error('Error al enviar informe por email:', err);
        res.status(500).json({ error: 'Error al enviar el email. Verifique la configuración SMTP.' });
    }
});

module.exports = router;
