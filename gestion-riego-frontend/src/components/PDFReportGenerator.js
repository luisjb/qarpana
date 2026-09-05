import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { format } from 'date-fns';
import templateBase64 from '../assets/hoja_membretada_template';

class PDFReportGenerator {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = null;
        this.currentY = 0;
        this.pageHeight = 842; // A4 — matches hoja_membretada_2.pdf (841.92pt)
        this.pageWidth = 595;  // A4 — matches template (595.32pt)
        this.margin = 50;      // ~18mm left/right
        this.contentWidth = 495;
        this.contentTop = 730; // start below letterhead header (~112pt from top)
        this.contentBottom = 75; // stop above letterhead footer
        
        // Rutas alternativas para acceder al PDF
        this.templatePaths = [
            // NUEVO: Intentar acceso directo al puerto del contenedor
            `${window.location.protocol}//${window.location.hostname}:3000/assets/hoja_membretada_2.pdf`,
            '/assets/hoja_membretada_2.pdf',
            './assets/hoja_membretada_2.pdf',
            '/public/assets/hoja_membretada_2.pdf',
            './public/assets/hoja_membretada_2.pdf',
            `${window.location.origin}/assets/hoja_membretada_2.pdf`,
            `${window.location.origin}/public/assets/hoja_membretada_2.pdf`
        ];
        
        this.font = null;
        this.boldFont = null;
        this.usingTemplate = false;
    }

    async generateReport(campoData, lotesData, recomendaciones, { returnBytes = false } = {}) {
        try {
            console.log('🚀 Iniciando generación de informe PDF');
            
            // Crear documento PDF
            this.pdfDoc = await PDFDocument.create();
            
            // Cargar fuentes
            this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
            this.boldFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            // Verificar y cargar plantilla
            await this.loadTemplate();
            
            // Empezar después del header de la plantilla
            this.currentY = this.usingTemplate ? this.contentTop : this.pageHeight - 60;
            
            // Agregar título del informe
            await this.addReportTitle(campoData.nombre_campo);
            
            // Esperar a que todos los gráficos se carguen antes de capturar
            console.log('⏳ Esperando carga de gráficos...');
            await this.waitForChartsToLoad();
            
            // Store all recommendations for inline use per especie group
            // Backend returns sorted DESC by date — index 0 is most recent
            this.allRecomendaciones = recomendaciones || [];

            // Capturar y agregar resumen de círculos (solo las cards)
            await this.addResumenCirculosFromPage(lotesData);
            
            // Agregar información detallada por lote
            for (const lote of lotesData) {
                await this.addLoteDetalleCompleto(lote);
            }
            
            // Generar el PDF
            const pdfBytes = await this.pdfDoc.save();

            if (returnBytes) {
                return pdfBytes;
            }

            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `Informe_Balance_Hidrico_${campoData.nombre_campo}_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Informe PDF generado exitosamente');
            
        } catch (error) {
            console.error('❌ Error generando PDF:', error);
            throw error;
        }
    }

    // Nueva función para esperar a que los gráficos se carguen
    async waitForChartsToLoad() {
        const maxWaitTime = 5000; // 5 segundos máximo
        const checkInterval = 100; // revisar cada 100ms
        let elapsed = 0;
        
        while (elapsed < maxWaitTime) {
            const canvases = document.querySelectorAll('canvas');
            let allLoaded = true;
            
            for (const canvas of canvases) {
                const ctx = canvas.getContext('2d');
                if (ctx && canvas.width > 100 && canvas.height > 100) {
                    // Verificar si el canvas tiene contenido
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const hasContent = imageData.data.some(pixel => pixel !== 0);
                    
                    if (!hasContent) {
                        allLoaded = false;
                        break;
                    }
                }
            }
            
            if (allLoaded && canvases.length > 0) {
                console.log('✅ Gráficos cargados correctamente');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            elapsed += checkInterval;
        }
        
        console.warn('⚠️ Timeout esperando gráficos, continuando...');
    }

    async verifyTemplateAtPath(templatePath) {
        try {
            console.log(`🔍 Verificando plantilla en: ${templatePath}`);
            
            const response = await fetch(templatePath, {
                method: 'GET',
                headers: {
                    'Accept': 'application/pdf,*/*',
                    'Cache-Control': 'no-cache'
                },
                // NUEVO: Configuración para evitar problemas de CORS
                mode: 'cors',
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                console.warn(`❌ Template not found at: ${templatePath} (${response.status})`);
                return false;
            }
            
            // Verificar el Content-Type
            const contentType = response.headers.get('content-type');
            console.log('📋 Content-Type:', contentType);
            
            // Si es HTML, definitivamente no es nuestro PDF
            if (contentType && contentType.includes('text/html')) {
                console.warn(`❌ Received HTML instead of PDF at: ${templatePath}`);
                
                // Diagnóstico adicional
                if (templatePath.includes('/assets/')) {
                    console.log('💡 Sugerencia: Problema de proxy/nginx detectado');
                    console.log('💡 El servidor interno funciona, pero hay un proxy intermedio');
                    
                    // Mostrar primera parte del contenido para debug
                    const text = await response.text();
                    console.log('📄 Contenido HTML recibido (primeros 200 chars):', text.substring(0, 200));
                }
                
                return false;
            }
            
            const contentLength = response.headers.get('content-length');
            console.log('📏 Content-Length:', contentLength);
            
            // Verificar que el content-length coincida con nuestro PDF (48185 bytes)
            if (contentLength && parseInt(contentLength) !== 48185) {
                console.warn(`⚠️ Content-Length inesperado: ${contentLength}, esperado: 48185`);
                // No retornar false, porque podría ser una versión diferente del PDF
            }
            
            if (contentLength === '0') {
                console.warn('❌ Template file is empty');
                return false;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            console.log('📦 ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
            
            if (arrayBuffer.byteLength === 0) {
                console.warn('❌ Template arrayBuffer is empty');
                return false;
            }
            
            // Si el archivo es muy pequeño (menos de 1KB), probablemente sea HTML de error
            if (arrayBuffer.byteLength < 1024) {
                console.warn(`❌ File too small (${arrayBuffer.byteLength} bytes), probably an error page`);
                
                // Mostrar contenido para diagnóstico
                const text = new TextDecoder().decode(arrayBuffer.slice(0, 200));
                console.warn('📄 Contenido recibido:', text);
                
                return false;
            }
            
            // Verificar header PDF
            const bytes = new Uint8Array(arrayBuffer);
            const pdfHeader = String.fromCharCode(...bytes.slice(0, 4));
            console.log('🔤 PDF Header:', pdfHeader);
            
            if (pdfHeader !== '%PDF') {
                console.warn(`❌ Invalid PDF header: ${pdfHeader}`);
                // Mostrar más información del archivo
                const first50Bytes = String.fromCharCode(...bytes.slice(0, Math.min(50, bytes.length)));
                console.warn('📄 Primeros 50 bytes:', first50Bytes);
                return false;
            }
            
            console.log(`✅ Template verified successfully at: ${templatePath}`);
            console.log(`📊 PDF Stats: ${arrayBuffer.byteLength} bytes, Content-Type: ${contentType}`);
            return { valid: true, arrayBuffer };
            
        } catch (error) {
            console.warn(`❌ Error verifying template at ${templatePath}:`, error.message);
            return false;
        }
    }

    async loadTemplate() {
        try {
            console.log('📄 Cargando plantilla embebida...');

            const binaryStr = atob(templateBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }

            // embedPdf devuelve PDFEmbeddedPage[], el tipo correcto para drawPage()
            const [embeddedTemplate] = await this.pdfDoc.embedPdf(bytes.buffer, [0]);
            this.embeddedTemplate = embeddedTemplate;

            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            this.currentPage.drawPage(embeddedTemplate, {
                x: 0,
                y: 0,
                width: this.pageWidth,
                height: this.pageHeight,
            });

            this.usingTemplate = true;
            console.log('✅ Plantilla embebida cargada correctamente');

        } catch (error) {
            console.warn('❌ Failed to load embedded template, using fallback:', error.message);
            this.usingTemplate = false;
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            await this.addFallbackHeader();
        }
    }

    async addFallbackHeader() {
        // Header de respaldo estilo QARPANA
        this.currentPage.drawRectangle({
            x: 0,
            y: this.pageHeight - 60,
            width: this.pageWidth,
            height: 60,
            color: rgb(0.26, 0.63, 0.28), // Verde QARPANA
        });
        
        this.currentPage.drawText('QARPANA', {
            x: this.margin,
            y: this.pageHeight - 35,
            size: 20,
            font: this.boldFont,
            color: rgb(1, 1, 1),
        });

        // Línea decorativa verde
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.pageHeight - 70,
            width: this.contentWidth,
            height: 3,
            color: rgb(0.54, 0.76, 0.29),
        });

        // Footer
        this.addSimpleFooter();
    }

    addSimpleFooter() {
        const footerY = 50;
        
        // Línea separadora
        this.currentPage.drawRectangle({
            x: this.margin,
            y: footerY,
            width: this.contentWidth,
            height: 1,
            color: rgb(0.54, 0.76, 0.29),
        });
        
        // Información de contacto
        this.currentPage.drawText('QARPANA - Tel: 3525 640098 - Email: info@qarpana.com.ar', {
            x: this.margin,
            y: footerY - 15,
            size: 8,
            font: this.font,
            color: rgb(0.4, 0.4, 0.4),
        });
    }

    async addNewPage() {
        try {
            if (this.usingTemplate && this.embeddedTemplate) {
                this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                this.currentPage.drawPage(this.embeddedTemplate, {
                    x: 0,
                    y: 0,
                    width: this.pageWidth,
                    height: this.pageHeight,
                });
            } else {
                this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                await this.addFallbackHeader();
            }
        } catch (error) {
            console.warn('Error adding new page with template, using fallback:', error);
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            await this.addFallbackHeader();
        }

        this.currentY = this.usingTemplate ? 600 : 650;
    }

    async addReportTitle(nombreCampo) {
        // Colored header band
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.currentY - 6,
            width: this.contentWidth,
            height: 24,
            color: rgb(0.18, 0.55, 0.22),
        });
        this.currentPage.drawText('INFORME DE BALANCE HIDRICO', {
            x: this.margin + 12,
            y: this.currentY,
            size: 14,
            font: this.boldFont,
            color: rgb(1, 1, 1),
        });
        this.currentY -= 34;

        this.currentPage.drawText(`Campo: ${nombreCampo}`, {
            x: this.margin,
            y: this.currentY,
            size: 13,
            font: this.boldFont,
            color: rgb(0.1, 0.1, 0.1),
        });
        this.currentY -= 18;

        this.currentPage.drawText(`Fecha de generacion: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, {
            x: this.margin,
            y: this.currentY,
            size: 9,
            font: this.font,
            color: rgb(0.5, 0.5, 0.5),
        });
        this.currentY -= 16;

        // Thin separator
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.currentY,
            width: this.contentWidth,
            height: 1,
            color: rgb(0.75, 0.75, 0.75),
        });
        this.currentY -= 20;
    }

    drawSectionHeader(title) {
        // Green left accent + title
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.currentY - 5,
            width: 4,
            height: 20,
            color: rgb(0.18, 0.55, 0.22),
        });
        this.currentPage.drawText(title, {
            x: this.margin + 10,
            y: this.currentY,
            size: 13,
            font: this.boldFont,
            color: rgb(0.18, 0.55, 0.22),
        });
        this.currentY -= 24;
    }

    async addResumenCirculosFromPage(lotesData) {
        if (this.currentY < this.contentBottom + 180) {
            await this.addNewPage();
        }

        this.drawSectionHeader('RESUMEN DE CIRCULOS');
        this.currentY -= 6;

        // Sort by especie then render grouped
        const sorted = [...lotesData].sort((a, b) =>
            (a.especie || '').localeCompare(b.especie || '')
        );

        const grupos = sorted.reduce((acc, lote) => {
            const esp = lote.especie || 'Sin cultivo';
            if (!acc[esp]) acc[esp] = [];
            acc[esp].push(lote);
            return acc;
        }, {});

        const especiesOrdenadas = Object.keys(grupos).sort();

        for (let gi = 0; gi < especiesOrdenadas.length; gi++) {
            const especie = especiesOrdenadas[gi];
            const grupo = grupos[especie];

            if (gi > 0) {
                this.currentPage.drawRectangle({
                    x: this.margin,
                    y: this.currentY - 2,
                    width: this.contentWidth,
                    height: 0.5,
                    color: rgb(0.8, 0.8, 0.8),
                });
                this.currentY -= 14;
            }

            // Group header
            this.currentPage.drawText(especie.toUpperCase(), {
                x: this.margin,
                y: this.currentY,
                size: 9,
                font: this.boldFont,
                color: rgb(0.3, 0.3, 0.3),
            });
            this.currentPage.drawText(`(${grupo.length} lote${grupo.length !== 1 ? 's' : ''})`, {
                x: this.margin + this.boldFont.widthOfTextAtSize(especie.toUpperCase(), 9) + 5,
                y: this.currentY,
                size: 8,
                font: this.font,
                color: rgb(0.6, 0.6, 0.6),
            });
            this.currentY -= 14;

            await this.createLotesCardsProgrammatic(grupo);
            this.currentY -= 8;
            this.addEspecieRecomendacionInline(especie);
            this.currentY -= 10;
        }
    }

    addEspecieRecomendacionInline(especie) {
        // Find most recent recommendation for this especie (index 0 = most recent, backend returns DESC)
        const rec = (this.allRecomendaciones || []).find(r => r.cultivo === especie);
        if (!rec) return;
        if (this.currentY < this.contentBottom + 50) return;

        // Strip markdown markers for plain PDF text
        const texto = (rec.texto || '').replace(/\*\*/g, '').replace(/\*/g, '');
        const [fy, fm, fd] = (rec.fecha || '').substring(0, 10).split('-');
        const fechaStr = fd ? `${fd}/${fm}/${fy}` : '';
        const headerText = `Ultima recomendacion${fechaStr ? ` · ${fechaStr}` : ''}${rec.usuario ? ` · ${rec.usuario}` : ''}`;

        const lines = this.splitTextToLines(texto, this.contentWidth - 24, 9);
        const maxLines = Math.min(lines.length, 4);
        const boxH = 16 + maxLines * 12 + 8;

        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - boxH,
            width: this.contentWidth, height: boxH,
            color: rgb(0.96, 0.99, 0.96),
            borderColor: rgb(0.6, 0.85, 0.6), borderWidth: 0.5,
        });
        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - boxH,
            width: 3, height: boxH,
            color: rgb(0.18, 0.55, 0.22),
        });

        this.currentPage.drawText(headerText, {
            x: this.margin + 8, y: this.currentY - 11,
            size: 7.5, font: this.boldFont, color: rgb(0.18, 0.55, 0.22),
        });

        for (let i = 0; i < maxLines; i++) {
            const line = lines[i];
            const isBullet = line.startsWith('• ') || line.startsWith('- ');
            this.currentPage.drawText(isBullet ? `• ${line.slice(2)}` : line, {
                x: this.margin + 8, y: this.currentY - 22 - (i * 12),
                size: 9, font: this.font, color: rgb(0.15, 0.15, 0.15),
            });
        }

        this.currentY -= boxH;
    }

    async createLotesCardsProgrammatic(lotesData) {
        const cardWidth = 158;
        const cardHeight = 180;
        const gapH = 12;
        const gapV = 14;
        const cardsPerRow = 3;
        const outerR = 16;
        const innerR = 12;

        let col = 0;
        let rowTop = this.currentY;

        for (let i = 0; i < lotesData.length; i++) {
            const lote = lotesData[i];

            if (rowTop - cardHeight < this.contentBottom) {
                await this.addNewPage();
                rowTop = this.currentY;
                col = 0;
            }

            const cardLeft = this.margin + col * (cardWidth + gapH);
            const cardBottom = rowTop - cardHeight;

            this.drawCard(lote, cardLeft, cardBottom, cardWidth, cardHeight, outerR, innerR);

            col++;
            if (col >= cardsPerRow) {
                col = 0;
                rowTop = rowTop - cardHeight - gapV;
            }
        }

        if (col > 0) {
            this.currentY = rowTop - cardHeight - gapV;
        } else {
            this.currentY = rowTop;
        }
    }

    drawCard(lote, cardLeft, cardBottom, cardWidth, cardHeight, outerR, innerR) {
        const cardTop = cardBottom + cardHeight;
        const wd = lote.waterData || {};
        const umbral = wd.porcentajeAguaUtilUmbral || 50;
        const pad = 8;
        const innerLeft = cardLeft + pad + 3;

        // Shadow + card background
        this.currentPage.drawRectangle({
            x: cardLeft + 2, y: cardBottom - 2,
            width: cardWidth, height: cardHeight,
            color: rgb(0.82, 0.82, 0.82),
        });
        this.currentPage.drawRectangle({
            x: cardLeft, y: cardBottom,
            width: cardWidth, height: cardHeight,
            color: rgb(1, 1, 1),
            borderColor: rgb(0.87, 0.87, 0.87),
            borderWidth: 0.5,
        });
        // Left accent
        this.currentPage.drawRectangle({
            x: cardLeft, y: cardBottom,
            width: 3, height: cardHeight,
            color: rgb(0.18, 0.55, 0.22),
        });

        // Lote name
        const nombre = (lote.nombre_lote || '').substring(0, 22);
        this.currentPage.drawText(nombre, {
            x: innerLeft, y: cardTop - 16,
            size: 10, font: this.boldFont, color: rgb(0.1, 0.1, 0.1),
        });

        // Especie - variedad
        this.currentPage.drawText(`${lote.especie || ''} - ${lote.variedad || ''}`.substring(0, 27), {
            x: innerLeft, y: cardTop - 27,
            size: 7, font: this.font, color: rgb(0.5, 0.5, 0.5),
        });

        // Campaña
        this.currentPage.drawText(`Campana: ${lote.campaña || ''}`, {
            x: innerLeft, y: cardTop - 37,
            size: 7, font: this.font, color: rgb(0.5, 0.5, 0.5),
        });

        // Separator
        this.currentPage.drawRectangle({
            x: cardLeft + pad, y: cardTop - 44,
            width: cardWidth - pad * 2, height: 0.5,
            color: rgb(0.87, 0.87, 0.87),
        });

        // Gauge centers (2 gauges per depth section, side by side)
        const g1x = cardLeft + 43;
        const g2x = cardLeft + 115;

        // --- 0-100 cm ---
        const sec1Y = cardTop - 51;
        this.currentPage.drawText('0-100 cm', {
            x: innerLeft, y: sec1Y,
            size: 7, font: this.boldFont, color: rgb(0.25, 0.53, 0.96),
        });
        this.currentPage.drawText('Actual', {
            x: g1x - 9, y: sec1Y - 10,
            size: 6, font: this.font, color: rgb(0.45, 0.45, 0.45),
        });
        this.currentPage.drawText('Proy 7d', {
            x: g2x - 12, y: sec1Y - 10,
            size: 6, font: this.font, color: rgb(0.45, 0.45, 0.45),
        });

        const gy1 = sec1Y - 30;
        this.drawGaugeArc(g1x, gy1, outerR, innerR, wd.porcentajeAu1m || 0, umbral);
        this.drawGaugeArc(g2x, gy1, outerR, innerR, wd.porcentajeProyectado || 0, umbral);

        this.currentPage.drawText(`${Math.round(wd.aguaUtil1m || 0)} mm`, {
            x: g1x - 9, y: gy1 - outerR - 8,
            size: 6, font: this.font, color: rgb(0.3, 0.3, 0.3),
        });

        // Separator between depth sections
        const midY = gy1 - outerR - 18;
        this.currentPage.drawRectangle({
            x: cardLeft + pad, y: midY,
            width: cardWidth - pad * 2, height: 0.5,
            color: rgb(0.87, 0.87, 0.87),
        });

        // --- 0-200 cm ---
        const sec2Y = midY - 9;
        this.currentPage.drawText('0-200 cm', {
            x: innerLeft, y: sec2Y,
            size: 7, font: this.boldFont, color: rgb(0.25, 0.53, 0.96),
        });
        this.currentPage.drawText('Actual', {
            x: g1x - 9, y: sec2Y - 10,
            size: 6, font: this.font, color: rgb(0.45, 0.45, 0.45),
        });
        this.currentPage.drawText('Proy 7d', {
            x: g2x - 12, y: sec2Y - 10,
            size: 6, font: this.font, color: rgb(0.45, 0.45, 0.45),
        });

        const gy2 = sec2Y - 30;
        this.drawGaugeArc(g1x, gy2, outerR, innerR, wd.porcentajeAu2m || 0, umbral);
        this.drawGaugeArc(g2x, gy2, outerR, innerR, wd.porcentajeProyectado2m || 0, umbral);

        this.currentPage.drawText(`${Math.round(wd.aguaUtil2m || 0)} mm`, {
            x: g1x - 9, y: gy2 - outerR - 8,
            size: 6, font: this.font, color: rgb(0.3, 0.3, 0.3),
        });
    }

    drawGaugeArc(cx, cy, outerR, innerR, percentage, umbral = 50) {
        const p = Math.min(Math.max(Number(percentage) || 0, 0), 100);

        // Gray background
        this.currentPage.drawCircle({ x: cx, y: cy, size: outerR, color: rgb(0.88, 0.88, 0.88) });

        if (p > 0) {
            const [r, g, b] = this.getColorByUmbral(p, umbral);
            const fillColor = rgb(r / 255, g / 255, b / 255);

            if (p >= 99.5) {
                this.currentPage.drawCircle({ x: cx, y: cy, size: outerR, color: fillColor });
            } else {
                const θ = (p / 100) * 2 * Math.PI;
                const endX = +(outerR * Math.sin(θ)).toFixed(4);
                const endY = +(-outerR * Math.cos(θ)).toFixed(4);
                const largeArc = θ > Math.PI ? 1 : 0;
                const path = `M 0 0 L 0 ${-outerR} A ${outerR} ${outerR} 0 ${largeArc} 1 ${endX} ${endY} Z`;
                this.currentPage.drawSvgPath(path, { x: cx, y: cy, color: fillColor });
            }
        }

        // White donut hole
        this.currentPage.drawCircle({ x: cx, y: cy, size: innerR, color: rgb(1, 1, 1) });

        // Percentage text
        const text = `${Math.round(p)}%`;
        const tSize = 6;
        this.currentPage.drawText(text, {
            x: cx - text.length * tSize * 0.28,
            y: cy - tSize / 2,
            size: tSize,
            font: this.boldFont,
            color: rgb(0.15, 0.15, 0.15),
        });
    }

    getColorByUmbral(percentage, umbral = 50) {
        if (percentage <= umbral / 2) return [239, 68, 68];  // Red
        if (percentage <= umbral) return [249, 115, 22];       // Orange
        return [34, 197, 94];                                  // Green
    }

    async addRecomendaciones(recomendaciones) {
        if (this.currentY < this.contentBottom + 80) {
            await this.addNewPage();
        }

        this.drawSectionHeader('RECOMENDACIONES');
        this.currentY -= 4;
        
        if (recomendaciones && recomendaciones.length > 0) {
            const recomendacion = recomendaciones[0];
            const texto = recomendacion.texto || 
                         recomendacion.descripcion || 
                         recomendacion.recomendacion || 
                         String(recomendacion);
            
            // Dividir texto en líneas
            const lines = this.splitTextToLines(texto, this.contentWidth - 20, 11);
            
            // Dibujar fondo para la recomendación
            this.currentPage.drawRectangle({
                x: this.margin,
                y: this.currentY - (lines.length * 15) - 10,
                width: this.contentWidth,
                height: (lines.length * 15) + 20,
                color: rgb(0.97, 0.97, 0.97),
            });
            
            // Dibujar texto
            lines.forEach((line, index) => {
                this.currentPage.drawText(line, {
                    x: this.margin + 10,
                    y: this.currentY - (index * 15),
                    size: 11,
                    font: this.font,
                    color: rgb(0, 0, 0),
                });
            });
            
            this.currentY -= (lines.length * 15) + 30;
            
            // Fecha si está disponible
            if (recomendacion.fecha_creacion || recomendacion.fecha) {
                const fecha = recomendacion.fecha_creacion || recomendacion.fecha;
                const [fy, fm, fd] = (fecha || '').substring(0, 10).split('-');
                const fechaFormateada = fd ? `${fd}/${fm}/${fy}` : String(fecha);
                
                this.currentPage.drawText(`Fecha: ${fechaFormateada}`, {
                    x: this.margin,
                    y: this.currentY,
                    size: 9,
                    font: this.font,
                    color: rgb(0.4, 0.4, 0.4),
                });
                
                this.currentY -= 20;
            }
        } else {
            this.currentPage.drawText('No hay recomendaciones disponibles para este campo.', {
                x: this.margin,
                y: this.currentY,
                size: 10,
                font: this.font,
                color: rgb(0.6, 0.6, 0.6),
            });
            this.currentY -= 30;
        }
    }

    async addLoteDetalleCompleto(lote) {
        await this.addNewPage();

        // Section header
        this.drawSectionHeader(`DETALLE: ${lote.nombre_lote}`);
        this.currentY -= 8;

        // Info block + gauges
        this.addLoteInfoBlock(lote);
        
        // NUEVO: Intentar capturar gráfico con método mejorado
        console.log(`📊 Intentando capturar gráfico del lote: ${lote.nombre_lote}`);
        await this.captureDetailedChartImproved(lote);
    }

    async captureDetailedChartImproved(lote) {
        try {
            console.log('📊 Intentando capturar gráfico específico del lote:', lote.nombre_lote);
            
            // ESTRATEGIA 1: Buscar gráficos en la página actual
            let success = await this.tryCurrentPageChart();
            if (success) return true;
            
            // ESTRATEGIA 2: Navegar específicamente al lote
            console.log('📍 Estrategia 2: Navegando a la página específica del lote');
            success = await this.navigateAndCaptureChart(lote);
            if (success) return true;
            
            // ESTRATEGIA 3: Usar datos de simulación para crear gráfico
            console.log('📊 Estrategia 3: Creando gráfico desde datos de simulación');
            if (lote.simulationData) {
                await this.createChartFromData(lote.simulationData);
                return true;
            }
            
            // FALLBACK: Gráfico simulado
            console.log('❌ Todas las estrategias fallaron, usando fallback');
            await this.addChartFallback();
            return false;
            
        } catch (error) {
            console.error('❌ Error en captura mejorada:', error);
            await this.addChartFallback();
            return false;
        }
    }

    async tryCurrentPageChart() {
        try {
            console.log('🔍 Buscando gráficos en la página actual...');
            
            // Esperar un momento
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const allCanvases = Array.from(document.querySelectorAll('canvas'));
            console.log(`🎨 Canvas encontrados: ${allCanvases.length}`);
            
            for (const canvas of allCanvases) {
                if (canvas.width > 400 && canvas.height > 200) {
                    console.log('✅ Canvas de gráfico encontrado:', {
                        width: canvas.width,
                        height: canvas.height,
                        id: canvas.id,
                        className: canvas.className
                    });
                    
                    const success = await this.processCanvasImage(canvas);
                    if (success) return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('❌ Error buscando en página actual:', error);
            return false;
        }
    }

    async navigateAndCaptureChart(lote) {
        try {
            // Guardar URL actual
            const originalUrl = window.location.href;
            const targetUrl = `/simulations?lote=${lote.id}&campana=${lote.campaña}`;
            
            console.log(`🧭 Navegando temporalmente a: ${targetUrl}`);
            
            // Crear iframe invisible para cargar la página del gráfico
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.left = '-9999px';
            iframe.style.width = '1200px';
            iframe.style.height = '800px';
            iframe.src = targetUrl;
            document.body.appendChild(iframe);
            
            // Esperar a que cargue
            await new Promise((resolve) => {
                iframe.onload = () => {
                    setTimeout(resolve, 3000); // Esperar 3 segundos para que se renderice el gráfico
                };
            });
            
            // Buscar canvas en el iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const canvases = Array.from(iframeDoc.querySelectorAll('canvas'));
            
            console.log(`🎨 Canvas en iframe: ${canvases.length}`);
            
            let success = false;
            for (const canvas of canvases) {
                if (canvas.width > 400 && canvas.height > 200) {
                    console.log('✅ Canvas de gráfico encontrado en iframe');
                    success = await this.processCanvasImage(canvas);
                    if (success) break;
                }
            }
            
            // Limpiar iframe
            document.body.removeChild(iframe);
            
            return success;
            
        } catch (error) {
            console.error('❌ Error navegando a página específica:', error);
            return false;
        }
    }

    async createChartFromData(simulationData) {
        try {
            console.log('📊 Creando gráfico desde datos de simulación');
            
            // Verificar si necesitamos nueva página
            if (this.currentY - 250 < this.contentBottom) {
                await this.addNewPage();
            }
            
            // Título del gráfico
            this.currentPage.drawText('Balance Hidrico - Ultimos 30 dias', {
                x: this.margin,
                y: this.currentY,
                size: 12,
                font: this.boldFont,
                color: rgb(0.26, 0.63, 0.28),
            });
            
            this.currentY -= 25;
            
            const chartHeight = 200;
            const chartWidth = this.contentWidth;
            const chartStartY = this.currentY - chartHeight;
            
            // Fondo del gráfico
            this.currentPage.drawRectangle({
                x: this.margin,
                y: chartStartY,
                width: chartWidth,
                height: chartHeight,
                color: rgb(0.98, 0.98, 0.98),
                borderColor: rgb(0.8, 0.8, 0.8),
                borderWidth: 1,
            });
            
            // Grid horizontal
            for (let i = 1; i < 5; i++) {
                const y = chartStartY + (chartHeight * i / 5);
                this.currentPage.drawLine({
                    start: { x: this.margin, y: y },
                    end: { x: this.margin + chartWidth, y: y },
                    thickness: 0.5,
                    color: rgb(0.9, 0.9, 0.9),
                });
            }
            
            // Grid vertical
            const numVerticalLines = Math.min(simulationData.fechas?.length || 10, 10);
            for (let i = 1; i < numVerticalLines; i++) {
                const x = this.margin + (chartWidth * i / numVerticalLines);
                this.currentPage.drawLine({
                    start: { x: x, y: chartStartY },
                    end: { x: x, y: chartStartY + chartHeight },
                    thickness: 0.5,
                    color: rgb(0.9, 0.9, 0.9),
                });
            }
            
            // Dibujar datos reales si están disponibles
            if (simulationData.aguaUtil && simulationData.aguaUtil.length > 0) {
                const maxValue = Math.max(...simulationData.aguaUtil.filter(v => v !== null && !isNaN(v)));
                const minValue = Math.min(...simulationData.aguaUtil.filter(v => v !== null && !isNaN(v)));
                const range = maxValue - minValue || 100;
                
                console.log('📈 Dibujando con datos reales:', {
                    puntos: simulationData.aguaUtil.length,
                    max: maxValue,
                    min: minValue
                });
                
                // Línea de agua útil con datos reales
                const points = simulationData.aguaUtil.map((value, index) => {
                    if (value === null || isNaN(value)) return null;
                    
                    const x = this.margin + (chartWidth * index / (simulationData.aguaUtil.length - 1));
                    const normalizedValue = (value - minValue) / range;
                    const y = chartStartY + chartHeight * 0.2 + (chartHeight * 0.6 * normalizedValue);
                    
                    return { x, y };
                }).filter(p => p !== null);
                
                // Dibujar línea de agua útil
                for (let i = 0; i < points.length - 1; i++) {
                    if (points[i] && points[i + 1]) {
                        this.currentPage.drawLine({
                            start: points[i],
                            end: points[i + 1],
                            thickness: 2,
                            color: rgb(0.15, 0.18, 0.54),
                        });
                    }
                }
                
                // Línea de umbral si existe
                if (simulationData.aguaUtilUmbral && simulationData.aguaUtilUmbral.length > 0) {
                    const umbralValue = simulationData.aguaUtilUmbral[0];
                    const umbralNormalized = (umbralValue - minValue) / range;
                    const umbralY = chartStartY + chartHeight * 0.2 + (chartHeight * 0.6 * umbralNormalized);
                    
                    this.currentPage.drawLine({
                        start: { x: this.margin, y: umbralY },
                        end: { x: this.margin + chartWidth, y: umbralY },
                        thickness: 2,
                        color: rgb(0.84, 0, 0),
                        dashArray: [5, 5],
                    });
                }
                
                // Etiquetas con valores reales
                this.currentPage.drawText(`Máx: ${Math.round(maxValue)} mm`, {
                    x: this.margin + 10,
                    y: chartStartY + chartHeight - 20,
                    size: 8,
                    font: this.font,
                    color: rgb(0.15, 0.18, 0.54),
                });
                
                this.currentPage.drawText(`Mín: ${Math.round(minValue)} mm`, {
                    x: this.margin + 10,
                    y: chartStartY + 10,
                    size: 8,
                    font: this.font,
                    color: rgb(0.15, 0.18, 0.54),
                });
                
            } else {
                // Si no hay datos, usar gráfico simulado
                this.addSimulatedChart(chartStartY, chartWidth, chartHeight);
            }
            
            // Leyenda (usando caracteres compatibles con WinAnsi)
            this.currentPage.drawText('— Agua Útil', {
                x: this.margin + chartWidth - 100,
                y: chartStartY + chartHeight - 20,
                size: 8,
                font: this.font,
                color: rgb(0.15, 0.18, 0.54),
            });
            
            this.currentPage.drawText('- - Umbral', {
                x: this.margin + chartWidth - 100,
                y: chartStartY + chartHeight - 35,
                size: 8,
                font: this.font,
                color: rgb(0.84, 0, 0),
            });
            
            this.currentY = chartStartY - 20;
            
            // Agregar resumen de datos
            this.addBalanceSummary(simulationData);
            
            return true;
            
        } catch (error) {
            console.error('❌ Error creando gráfico desde datos:', error);
            return false;
        }
    }

    addSimulatedChart(chartStartY, chartWidth, chartHeight) {
        // Crear datos simulados más realistas
        const points = [];
        const numPoints = 30;
        let baseValue = 120; // Valor base en mm
        
        for (let i = 0; i < numPoints; i++) {
            const x = this.margin + (chartWidth * i / (numPoints - 1));
            
            // Simular variación más realista
            const trend = -0.5 * i; // Tendencia descendente ligera
            const seasonal = 20 * Math.sin(i * 0.2); // Variación estacional
            const random = (Math.random() - 0.5) * 10; // Variación aleatoria
            
            const value = Math.max(0, baseValue + trend + seasonal + random);
            const y = chartStartY + chartHeight * 0.2 + (chartHeight * 0.6 * (value / 150));
            
            points.push({ x, y });
        }
        
        // Dibujar línea simulada
        for (let i = 0; i < points.length - 1; i++) {
            this.currentPage.drawLine({
                start: points[i],
                end: points[i + 1],
                thickness: 2,
                color: rgb(0.15, 0.18, 0.54),
            });
        }
        
        // Línea de umbral simulada
        const umbralY = chartStartY + chartHeight * 0.4;
        this.currentPage.drawLine({
            start: { x: this.margin, y: umbralY },
            end: { x: this.margin + chartWidth, y: umbralY },
            thickness: 2,
            color: rgb(0.84, 0, 0),
            dashArray: [5, 5],
        });
    }

    async processCanvasImage(canvas, lote = null) {
        try {
            // Verificar que el canvas tenga contenido
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const hasContent = imageData.data.some((pixel, index) => {
                // Revisar solo valores RGB (saltar alpha)
                return index % 4 !== 3 && pixel !== 0 && pixel !== 255;
            });
            
            if (!hasContent) {
                console.warn('⚠️ Canvas parece estar vacío o solo con fondo');
                return false;
            }
            
            console.log('📊 Procesando canvas con contenido válido');
            
            const dataURL = canvas.toDataURL('image/png', 1.0);
            
            // Verificar que no sea un canvas completamente transparente
            if (dataURL.length < 1000) {
                console.warn('⚠️ Canvas demasiado pequeño, probablemente vacío');
                return false;
            }
            
            const imgBytes = this.dataURLtoUint8Array(dataURL);
            const image = await this.pdfDoc.embedPng(imgBytes);
            const originalDims = image.scale(1);
            
            // Escalar para que entre en la página
            const maxWidth = this.contentWidth;
            const maxHeight = 250;
            
            let scale = Math.min(
                maxWidth / originalDims.width,
                maxHeight / originalDims.height,
                0.8
            );
            
            const imageDims = image.scale(scale);
            
            // Verificar si necesitamos nueva página
            if (this.currentY - imageDims.height < 100) {
                await this.addNewPage();
            }
            
            // Título del gráfico
            this.currentPage.drawText('Balance Hidrico - Ultimos 30 dias', {
                x: this.margin,
                y: this.currentY,
                size: 12,
                font: this.boldFont,
                color: rgb(0.26, 0.63, 0.28),
            });
            
            this.currentY -= 25;
            
            // Centrar la imagen
            const imageX = this.margin + (this.contentWidth - imageDims.width) / 2;
            
            // Dibujar imagen del gráfico
            this.currentPage.drawImage(image, {
                x: imageX,
                y: this.currentY - imageDims.height,
                width: imageDims.width,
                height: imageDims.height,
            });
            
            this.currentY -= imageDims.height + 20;
            console.log('✅ Gráfico capturado y añadido exitosamente');
            
            return true;
            
        } catch (error) {
            console.error('❌ Error procesando imagen del canvas:', error);
            return false;
        }
    }

    addLoteInfoBlock(lote) {
        const wd = lote.waterData || {};
        const sd = lote.simulationData || {};
        const umbral = wd.porcentajeAguaUtilUmbral || 50;
        const outerR = 18;
        const innerR = 14;

        // ── Info table ────────────────────────────────────────────────
        const tableH = 56;
        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - tableH,
            width: this.contentWidth, height: tableH,
            color: rgb(0.97, 0.97, 0.97),
            borderColor: rgb(0.87, 0.87, 0.87), borderWidth: 0.5,
        });
        // Left accent
        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - tableH,
            width: 3, height: tableH,
            color: rgb(0.18, 0.55, 0.22),
        });

        const col1 = this.margin + 12;
        const col2 = this.margin + this.contentWidth / 2 + 6;
        const row1 = this.currentY - 16;
        const row2 = this.currentY - 36;

        const kv = (label, val, x, y) => {
            this.currentPage.drawText(label, {
                x, y, size: 8, font: this.boldFont, color: rgb(0.45, 0.45, 0.45),
            });
            this.currentPage.drawText(String(val || 'N/A'), {
                x: x + this.boldFont.widthOfTextAtSize(label, 8) + 4, y,
                size: 8, font: this.font, color: rgb(0.1, 0.1, 0.1),
            });
        };

        kv('Cultivo:', lote.especie, col1, row1);
        kv('Variedad:', lote.variedad, col2, row1);
        kv('Campaña:', lote.campaña, col1, row2);
        kv('Est. Fenológico:', sd.estadoFenologico, col2, row2);

        this.currentY -= tableH + 16;

        // ── Gauges row ────────────────────────────────────────────────
        // Separator label
        this.currentPage.drawText('Balance hídrico actual y proyección 7 días', {
            x: this.margin, y: this.currentY,
            size: 9, font: this.boldFont, color: rgb(0.3, 0.3, 0.3),
        });
        this.currentY -= 14;

        // 4 gauges in a row, equally spaced
        const gaugeAreaW = this.contentWidth;
        const colW = gaugeAreaW / 4;
        const labels = ['0-100cm Actual', '0-100cm Proy 7d', '0-200cm Actual', '0-200cm Proy 7d'];
        const values = [
            wd.porcentajeAu1m || 0,
            wd.porcentajeProyectado || 0,
            wd.porcentajeAu2m || 0,
            wd.porcentajeProyectado2m || 0,
        ];
        const mmVals = [
            Math.round(wd.aguaUtil1m || 0),
            null,
            Math.round(wd.aguaUtil2m || 0),
            null,
        ];

        // Background band for gauge row
        const gaugeRowH = outerR * 2 + 38;
        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - gaugeRowH,
            width: this.contentWidth, height: gaugeRowH,
            color: rgb(0.985, 0.985, 0.985),
            borderColor: rgb(0.87, 0.87, 0.87), borderWidth: 0.5,
        });

        for (let i = 0; i < 4; i++) {
            const cx = this.margin + colW * i + colW / 2;
            const labelY = this.currentY - 12;
            const gcy = this.currentY - 14 - outerR - 4;
            const mmY = gcy - outerR - 8;

            // Vertical divider between depth sections
            if (i === 2) {
                this.currentPage.drawRectangle({
                    x: this.margin + colW * 2 - 0.5, y: this.currentY - gaugeRowH,
                    width: 1, height: gaugeRowH,
                    color: rgb(0.82, 0.82, 0.82),
                });
            }

            // Label above gauge
            const lbl = labels[i];
            this.currentPage.drawText(lbl, {
                x: cx - this.font.widthOfTextAtSize(lbl, 6.5) / 2,
                y: labelY,
                size: 6.5, font: this.font, color: rgb(0.4, 0.4, 0.4),
            });

            this.drawGaugeArc(cx, gcy, outerR, innerR, values[i], umbral);

            // mm value below gauge
            if (mmVals[i] !== null) {
                const mmTxt = `${mmVals[i]} mm`;
                this.currentPage.drawText(mmTxt, {
                    x: cx - this.font.widthOfTextAtSize(mmTxt, 7) / 2,
                    y: mmY, size: 7, font: this.font, color: rgb(0.35, 0.35, 0.35),
                });
            }
        }

        this.currentY -= gaugeRowH + 14;

        // ── Key numbers strip ─────────────────────────────────────────
        const stripH = 34;
        const stripItems = [
            { label: 'AU Inicial 0-100cm', val: `${Math.round(sd.auInicial1m || 0)} mm` },
            { label: 'AU Inicial 0-200cm', val: `${Math.round(sd.auInicial2m || 0)} mm` },
            { label: 'Proy. 7d 0-100cm',  val: `${Math.round(sd.proyeccionAU1mDia8 || 0)} mm` },
            { label: 'Proy. 7d 0-200cm',  val: `${Math.round(sd.proyeccionAU2mDia8 || 0)} mm` },
            { label: 'Umbral',             val: `${umbral}%` },
        ];
        const stripColW = this.contentWidth / stripItems.length;

        this.currentPage.drawRectangle({
            x: this.margin, y: this.currentY - stripH,
            width: this.contentWidth, height: stripH,
            color: rgb(0.18, 0.55, 0.22),
        });

        stripItems.forEach((item, i) => {
            const sx = this.margin + stripColW * i + stripColW / 2;
            this.currentPage.drawText(item.label, {
                x: sx - this.font.widthOfTextAtSize(item.label, 6) / 2,
                y: this.currentY - 13,
                size: 6, font: this.font, color: rgb(0.85, 1, 0.85),
            });
            this.currentPage.drawText(item.val, {
                x: sx - this.boldFont.widthOfTextAtSize(item.val, 9) / 2,
                y: this.currentY - 26,
                size: 9, font: this.boldFont, color: rgb(1, 1, 1),
            });
        });

        this.currentY -= stripH + 16;
    }

    async addChartFallback() {
        if (this.currentY - 200 < this.contentBottom) {
            await this.addNewPage();
        }
        // Título del gráfico
        this.currentPage.drawText('Balance Hidrico - Ultimos 30 dias', {
            x: this.margin,
            y: this.currentY,
            size: 12,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 20;
        
        // Crear un área representando el gráfico con más estilo
        const chartHeight = 180;
        const chartWidth = this.contentWidth;
        
        // Fondo del gráfico
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.currentY - chartHeight,
            width: chartWidth,
            height: chartHeight,
            color: rgb(0.98, 0.98, 0.98),
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
        });
        
        // Líneas de grid horizontales
        for (let i = 1; i < 5; i++) {
            const y = this.currentY - (chartHeight * i / 5);
            this.currentPage.drawLine({
                start: { x: this.margin, y: y },
                end: { x: this.margin + chartWidth, y: y },
                thickness: 0.5,
                color: rgb(0.9, 0.9, 0.9),
            });
        }
        
        // Líneas de grid verticales
        for (let i = 1; i < 8; i++) {
            const x = this.margin + (chartWidth * i / 8);
            this.currentPage.drawLine({
                start: { x: x, y: this.currentY },
                end: { x: x, y: this.currentY - chartHeight },
                thickness: 0.5,
                color: rgb(0.9, 0.9, 0.9),
            });
        }
        
        // Simular una curva de agua útil
        const points = [];
        const numPoints = 30;
        for (let i = 0; i < numPoints; i++) {
            const x = this.margin + (chartWidth * i / (numPoints - 1));
            // Crear una curva que simule variación de agua útil
            const variation = Math.sin(i * 0.3) * 20 + Math.cos(i * 0.2) * 15;
            const y = this.currentY - chartHeight * 0.3 - variation;
            points.push({ x, y });
        }
        
        // Dibujar la línea de agua útil
        for (let i = 0; i < points.length - 1; i++) {
            this.currentPage.drawLine({
                start: points[i],
                end: points[i + 1],
                thickness: 2,
                color: rgb(0.15, 0.18, 0.54), // Azul oscuro
            });
        }
        
        // Línea de umbral
        const umbralY = this.currentY - chartHeight * 0.6;
        this.currentPage.drawLine({
            start: { x: this.margin, y: umbralY },
            end: { x: this.margin + chartWidth, y: umbralY },
            thickness: 2,
            color: rgb(0.84, 0, 0),
            dashArray: [5, 5],
        });
        
        // Etiquetas
        this.currentPage.drawText('Agua Útil', {
            x: this.margin + 10,
            y: this.currentY - 30,
            size: 8,
            font: this.font,
            color: rgb(0.15, 0.18, 0.54),
        });
        
        this.currentPage.drawText('Umbral', {
            x: this.margin + 10,
            y: umbralY + 5,
            size: 8,
            font: this.font,
            color: rgb(0.84, 0, 0),
        });
        
        // Texto explicativo
        this.currentPage.drawText('Gráfico no disponible en tiempo real', {
            x: this.margin + chartWidth/2 - 80,
            y: this.currentY - chartHeight/2,
            size: 10,
            font: this.font,
            color: rgb(0.6, 0.6, 0.6),
        });
        
        this.currentPage.drawText('Para ver el gráfico interactivo completo, acceder a la plataforma web', {
            x: this.margin + 10,
            y: this.currentY - chartHeight - 15,
            size: 8,
            font: this.font,
            color: rgb(0.5, 0.5, 0.5),
        });
        
        this.currentY -= chartHeight + 30;
    }

    addBalanceSummary(simulationData) {
        if (!simulationData || this.currentY < 120) return;
        
        this.currentPage.drawText('Resumen del Periodo:', {
            x: this.margin,
            y: this.currentY,
            size: 11,
            font: this.boldFont,
            color: rgb(0, 0, 0),
        });
        
        this.currentY -= 15;
        
        const resumen = [
            `• Lluvia efectiva: ${Math.round(simulationData.lluviasEfectivasAcumuladas || 0)} mm`,
            `• Riego acumulado: ${Math.round(simulationData.riegoAcumulado || 0)} mm`,
            `• Agua util actual: ${Math.round(simulationData.aguaUtil?.[simulationData.aguaUtil.length - 1] || 0)} mm`,
            `• % Agua util: ${Math.round(simulationData.porcentajeAguaUtil || 0)}%`
        ];
        
        resumen.forEach(item => {
            this.currentPage.drawText(item, {
                x: this.margin,
                y: this.currentY,
                size: 9,
                font: this.font,
                color: rgb(0, 0, 0),
            });
            this.currentY -= 12;
        });
        
        this.currentY -= 10;
    }

    // Utilidades
    dataURLtoUint8Array(dataURL) {
        const arr = dataURL.split(',');
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return u8arr;
    }

    splitTextToLines(text, maxWidth, fontSize) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        // Aproximación simple para dividir texto
        const avgCharWidth = fontSize * 0.6;
        const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
        
        words.forEach(word => {
            if ((currentLine + word).length <= maxCharsPerLine) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        });
        
        if (currentLine) lines.push(currentLine);
        return lines;
    }
}

export default PDFReportGenerator;