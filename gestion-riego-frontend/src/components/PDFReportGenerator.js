import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';

class PDFReportGenerator {
    constructor() {
        this.doc = null;
        this.currentY = 0;
        this.pageHeight = 297; // A4 height in mm
        this.margin = 20;
        this.contentWidth = 170; // A4 width minus margins
        this.templatePath = '../assets/hoja membretada 2.pdf'; // Ruta de la plantilla
    }

    async generateReport(campoData, lotesData, recomendaciones) {
        this.doc = new jsPDF();
        
        try {
            // Intentar cargar la plantilla si existe
            await this.loadTemplate();
        } catch (error) {
            console.warn('No se pudo cargar la plantilla, usando diseño por defecto');
        }
        
        this.currentY = 60; // Comenzar más abajo para respetar el header de la plantilla
        
        // Configurar fuente Poppins (usar Helvetica como fallback)
        this.setupFont();
        
        // Agregar título del informe
        await this.addReportTitle(campoData.nombre_campo);
        
        // Agregar resumen de círculos (igual que en la página)
        await this.addResumenCirculosVisual(lotesData);
        
        // Agregar recomendaciones
        this.addRecomendaciones(recomendaciones);
        
        // Agregar información detallada por lote
        for (const lote of lotesData) {
            await this.addLoteDetalleCompleto(lote);
        }
        
        // Descargar el PDF
        const fileName = `Informe_Balance_Hidrico_${campoData.nombre_campo}_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
        this.doc.save(fileName);
    }

    async loadTemplate() {
        // Nota: Para usar una plantilla PDF real, necesitarías pdf-lib en lugar de jsPDF
        // Por ahora, simularemos el diseño de QARPANA
        this.addQarpanaTemplate();
    }

    addQarpanaTemplate() {
        // Recrear el diseño de QARPANA basado en la imagen
        
        // Header verde con logo
        this.doc.setFillColor(67, 160, 71); // Verde QARPANA
        this.doc.rect(0, 0, 210, 20, 'F');
        
        // Logo/Texto QARPANA
        this.doc.setTextColor(255, 255, 255);
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('QARPANA', this.margin, 12);
        
        // Línea decorativa verde
        this.doc.setDrawColor(139, 195, 74);
        this.doc.setLineWidth(2);
        this.doc.line(this.margin, 25, this.margin + this.contentWidth, 25);
        
        // Footer con información de contacto
        this.addFooterTemplate();
    }

    addFooterTemplate() {
        const footerY = 270;
        
        // Línea separadora
        this.doc.setDrawColor(139, 195, 74);
        this.doc.setLineWidth(0.5);
        this.doc.line(this.margin, footerY, this.margin + this.contentWidth, footerY);
        
        // Información de contacto (basada en la imagen del PDF)
        this.doc.setTextColor(100, 100, 100);
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'normal');
        
        const contactInfo = [
            'Teléfono: 3525 640098 / 3525 501392',
            'Instagram: @qarpana.riego',
            'Email: info@qarpana.com.ar'
        ];
        
        contactInfo.forEach((info, index) => {
            this.doc.text(info, this.margin, footerY + 8 + (index * 4));
        });
        
        // Reset color
        this.doc.setTextColor(0, 0, 0);
    }

    setupFont() {
        // Usar Helvetica como Poppins no está disponible por defecto en jsPDF
        // En un entorno real, necesitarías cargar la fuente Poppins
        this.doc.setFont('helvetica', 'normal');
    }

    async addReportTitle(nombreCampo) {
        this.doc.setFontSize(20);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(67, 160, 71);
        this.doc.text('INFORME DE BALANCE HÍDRICO', this.margin, this.currentY);
        
        this.currentY += 12;
        
        this.doc.setFontSize(16);
        this.doc.setTextColor(0, 0, 0);
        this.doc.text(`Campo: ${nombreCampo}`, this.margin, this.currentY);
        
        this.currentY += 8;
        
        this.doc.setFontSize(10);
        this.doc.setTextColor(100, 100, 100);
        this.doc.text(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, this.margin, this.currentY);
        
        this.currentY += 20;
    }

    async addResumenCirculosVisual(lotesData) {
        this.checkNewPage(100);
        
        // Título sección
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(67, 160, 71);
        this.doc.text('RESUMEN DE CÍRCULOS', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 20;
        
        // Recrear exactamente las cards como en la imagen
        await this.addLotesCards(lotesData);
    }

    async addLotesCards(lotesData) {
        const cardsPerRow = 3;
        const cardWidth = 50;
        const cardHeight = 45;
        const spacing = 10;
        
        let currentRow = 0;
        let currentCol = 0;
        
        for (let i = 0; i < lotesData.length; i++) {
            const lote = lotesData[i];
            
            // Calcular posición de la card
            const x = this.margin + (currentCol * (cardWidth + spacing));
            const y = this.currentY + (currentRow * (cardHeight + spacing));
            
            // Verificar si necesitamos nueva página
            if (y + cardHeight > this.pageHeight - 50) {
                this.doc.addPage();
                this.addQarpanaTemplate();
                this.currentY = 60;
                currentRow = 0;
                currentCol = 0;
                continue;
            }
            
            // Dibujar card del lote
            await this.drawLoteCard(lote, x, y, cardWidth, cardHeight);
            
            // Actualizar posición
            currentCol++;
            if (currentCol >= cardsPerRow) {
                currentCol = 0;
                currentRow++;
            }
        }
        
        // Actualizar currentY para el siguiente contenido
        const totalRows = Math.ceil(lotesData.length / cardsPerRow);
        this.currentY += (totalRows * (cardHeight + spacing)) + 20;
    }

    async drawLoteCard(lote, x, y, width, height) {
        // Fondo de la card
        this.doc.setFillColor(248, 249, 250);
        this.doc.setDrawColor(230, 230, 230);
        this.doc.roundedRect(x, y, width, height, 2, 2, 'FD');
        
        // Título del lote
        this.doc.setFontSize(10);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 0, 0);
        const nombreTruncado = lote.nombre_lote.length > 12 ? 
            lote.nombre_lote.substring(0, 12) + '...' : lote.nombre_lote;
        this.doc.text(nombreTruncado, x + 2, y + 5);
        
        // Cultivo y variedad
        this.doc.setFontSize(7);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(100, 100, 100);
        const cultivoTexto = `${lote.especie} - ${lote.variedad}`.substring(0, 20);
        this.doc.text(cultivoTexto, x + 2, y + 9);
        
        // Campaña
        this.doc.text(`Campaña: ${lote.campaña}`, x + 2, y + 12);
        
        // Gauges para 1m y 2m (recrear como en la imagen)
        const gauge1X = x + 8;
        const gauge1Y = y + 18;
        const gauge2X = x + 30;
        const gauge2Y = y + 18;
        const gaugeSize = 12;
        
        // Gauge 1 Metro
        this.drawMiniGauge(
            gauge1X, gauge1Y, gaugeSize, 
            lote.waterData?.porcentajeAu1m || 0,
            '1m'
        );
        
        // Gauge 2 Metros
        this.drawMiniGauge(
            gauge2X, gauge2Y, gaugeSize, 
            lote.waterData?.porcentajeAu2m || 0,
            '2m'
        );
        
        // Valores en mm
        this.doc.setFontSize(6);
        this.doc.setTextColor(0, 0, 0);
        this.doc.text(`${Math.round(lote.waterData?.aguaUtil1m || 0)} mm`, gauge1X - 3, y + height - 3);
        this.doc.text(`${Math.round(lote.waterData?.aguaUtil2m || 0)} mm`, gauge2X - 3, y + height - 3);
    }

    drawMiniGauge(x, y, size, percentage, label) {
        const radius = size / 2;
        const centerX = x + radius;
        const centerY = y + radius;
        
        // Fondo del gauge
        this.doc.setFillColor(230, 230, 230);
        this.doc.circle(centerX, centerY, radius, 'F');
        
        // Color según porcentaje
        const color = this.getColorByPercentage(percentage);
        this.doc.setFillColor(...color);
        
        // Dibujar progreso (simulado con círculo más pequeño)
        const progressRadius = radius * 0.8;
        const alpha = (percentage / 100) * 360;
        
        // Simular gauge con círculo relleno según porcentaje
        if (percentage > 0) {
            this.doc.circle(centerX, centerY, progressRadius, 'F');
        }
        
        // Texto del porcentaje
        this.doc.setTextColor(255, 255, 255);
        this.doc.setFontSize(6);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(`${Math.round(percentage)}%`, centerX - 4, centerY + 1);
        
        // Label
        this.doc.setTextColor(0, 0, 0);
        this.doc.setFontSize(5);
        this.doc.text(label, centerX - 2, y - 2);
    }

    addRecomendaciones(recomendaciones) {
        this.checkNewPage(60);
        
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(67, 160, 71);
        this.doc.text('RECOMENDACIONES', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 15;
        
        if (recomendaciones && recomendaciones.length > 0) {
            const recomendacion = recomendaciones[0];
            
            this.doc.setFontSize(11);
            this.doc.setFont('helvetica', 'normal');
            
            const texto = recomendacion.texto || 
                         recomendacion.descripcion || 
                         recomendacion.recomendacion || 
                         String(recomendacion);
            
            // Dividir texto largo en líneas
            const lines = this.doc.splitTextToSize(texto, this.contentWidth - 10);
            
            // Fondo para la recomendación
            this.doc.setFillColor(248, 249, 250);
            this.doc.roundedRect(this.margin, this.currentY - 5, this.contentWidth, lines.length * 5 + 10, 2, 2, 'F');
            
            this.doc.text(lines, this.margin + 5, this.currentY + 2);
            this.currentY += (lines.length * 5) + 15;
            
            // Fecha si está disponible
            if (recomendacion.fecha_creacion || recomendacion.fecha) {
                this.doc.setFontSize(8);
                this.doc.setFont('helvetica', 'italic');
                this.doc.setTextColor(100, 100, 100);
                const fecha = recomendacion.fecha_creacion || recomendacion.fecha;
                const fechaFormateada = new Date(fecha).toLocaleDateString('es-ES');
                this.doc.text(`Fecha: ${fechaFormateada}`, this.margin, this.currentY);
                this.doc.setTextColor(0, 0, 0);
                this.currentY += 10;
            }
        } else {
            this.doc.setFontSize(10);
            this.doc.setFont('helvetica', 'italic');
            this.doc.setTextColor(150, 150, 150);
            this.doc.text('No hay recomendaciones disponibles para este campo.', this.margin, this.currentY);
            this.doc.setTextColor(0, 0, 0);
            this.currentY += 15;
        }
        
        this.currentY += 10;
    }

    async addLoteDetalleCompleto(lote) {
        // Nueva página para cada lote
        this.doc.addPage();
        this.addQarpanaTemplate();
        this.currentY = 60;
        
        // Título del lote
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(67, 160, 71);
        this.doc.text(`DETALLE: ${lote.nombre_lote}`, this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 20;
        
        // Recrear las cards como en la imagen de simulaciones
        await this.addSimulationCards(lote);
        
        // Gráfico de balance hídrico
        if (lote.simulationData) {
            await this.addBalanceChart(lote);
        }
    }

    async addSimulationCards(lote) {
        // Recrear exactamente las cards como aparecen en la página de simulaciones
        const cardWidth = 40;
        const cardHeight = 25;
        const spacing = 5;
        
        // Primera fila: Cultivo, Variedad, Fecha Siembra, Estado Fenológico
        const row1Cards = [
            { title: 'Cultivo', value: lote.especie || 'N/A', icon: '🌱' },
            { title: 'Variedad', value: lote.variedad || 'N/A', icon: '🌱' },
            { title: 'Fecha de Siembra', value: lote.fecha_siembra ? format(new Date(lote.fecha_siembra), 'dd/MM/yyyy') : 'N/A', icon: '📅' },
            { title: 'Estado Fenológico', value: lote.simulationData?.estadoFenologico || 'N/A', icon: '🌱' }
        ];
        
        this.drawCardRow(row1Cards, this.currentY, cardWidth, cardHeight, spacing);
        this.currentY += cardHeight + 15;
        
        // Segunda fila: Cards de agua útil (como en la imagen)
        await this.addWaterCards(lote);
    }

    drawCardRow(cards, startY, cardWidth, cardHeight, spacing) {
        cards.forEach((card, index) => {
            const x = this.margin + (index * (cardWidth + spacing));
            
            // Fondo de la card
            this.doc.setFillColor(248, 249, 250);
            this.doc.setDrawColor(230, 230, 230);
            this.doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');
            
            // Título
            this.doc.setFontSize(8);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(67, 160, 71);
            this.doc.text(card.title, x + 2, startY + 5);
            
            // Valor
            this.doc.setFontSize(10);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setTextColor(0, 0, 0);
            const lines = this.doc.splitTextToSize(card.value, cardWidth - 4);
            this.doc.text(lines, x + 2, startY + 12);
        });
    }

    async addWaterCards(lote) {
        // Recrear las cards de agua útil como en la imagen
        const cardWidth = 50;
        const cardHeight = 35;
        const spacing = 8;
        
        // Card Agua Útil Inicial
        this.drawWaterCard(
            this.margin, this.currentY, cardWidth, cardHeight,
            'Agua Útil Inicial',
            [`1 Metro: ${Math.round(lote.simulationData?.auInicial1m || 0)} mm`,
             `2 Metros: ${Math.round(lote.simulationData?.auInicial2m || 0)} mm`]
        );
        
        // Card % AU Zona Radicular
        this.drawWaterCard(
            this.margin + cardWidth + spacing, this.currentY, cardWidth, cardHeight,
            '%AU Zona Radicular',
            [`${Math.round(lote.simulationData?.porcentajeAguaUtil || 0)}%`,
             `${Math.round(lote.simulationData?.aguaUtil?.[lote.simulationData.aguaUtil.length - 1] || 0)}mm`],
            true // Con gauge
        );
        
        // Card % Agua Útil
        this.drawWaterCard(
            this.margin + (cardWidth + spacing) * 2, this.currentY, cardWidth, cardHeight,
            '% Agua Útil',
            [`1m: ${Math.round(lote.waterData?.porcentajeAu1m || 0)}%`,
             `2m: ${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`],
            false,
            true // Con mini gauges
        );
        
        this.currentY += cardHeight + 20;
    }

    drawWaterCard(x, y, width, height, title, content, withMainGauge = false, withMiniGauges = false) {
        // Fondo de la card
        this.doc.setFillColor(248, 249, 250);
        this.doc.setDrawColor(63, 169, 245);
        this.doc.setLineWidth(0.5);
        this.doc.roundedRect(x, y, width, height, 2, 2, 'FD');
        
        // Título con icono de agua
        this.doc.setFontSize(9);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(63, 169, 245);
        this.doc.text('💧 ' + title, x + 2, y + 5);
        
        // Contenido
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0, 0, 0);
        
        content.forEach((line, index) => {
            this.doc.text(line, x + 2, y + 12 + (index * 5));
        });
        
        // Agregar gauges si corresponde
        if (withMiniGauges && content.length >= 2) {
            // Extraer porcentajes de los strings
            const perc1m = parseInt(content[0].match(/\d+/)?.[0] || '0');
            const perc2m = parseInt(content[1].match(/\d+/)?.[0] || '0');
            
            this.drawMiniGauge(x + width - 15, y + 8, 8, perc1m, '1m');
            this.drawMiniGauge(x + width - 15, y + 20, 8, perc2m, '2m');
        }
    }

    async addBalanceChart(lote) {
        this.checkNewPage(80);
        
        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(67, 160, 71);
        this.doc.text('Balance Hídrico - Últimos 30 días', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 15;
        
        // Simular el gráfico como en la imagen
        const chartWidth = this.contentWidth;
        const chartHeight = 60;
        
        // Fondo del gráfico
        this.doc.setFillColor(248, 249, 250);
        this.doc.setDrawColor(230, 230, 230);
        this.doc.rect(this.margin, this.currentY, chartWidth, chartHeight, 'FD');
        
        // Simular datos del gráfico
        this.drawSimulatedChart(this.margin, this.currentY, chartWidth, chartHeight, lote.simulationData);
        
        this.currentY += chartHeight + 20;
        
        // Resumen numérico
        this.addBalanceSummary(lote.simulationData);
    }

    drawSimulatedChart(x, y, width, height, simulationData) {
        if (!simulationData || !simulationData.aguaUtil) {
            this.doc.setFontSize(10);
            this.doc.text('No hay datos suficientes para el gráfico', x + 10, y + height/2);
            return;
        }
        
        // Simular línea de agua útil
        this.doc.setDrawColor(47, 128, 237);
        this.doc.setLineWidth(1);
        
        const data = simulationData.aguaUtil.slice(-30); // Últimos 30 datos
        const maxValue = Math.max(...data);
        
        if (data.length > 1) {
            for (let i = 0; i < data.length - 1; i++) {
                const x1 = x + (i / (data.length - 1)) * width;
                const y1 = y + height - (data[i] / maxValue) * height;
                const x2 = x + ((i + 1) / (data.length - 1)) * width;
                const y2 = y + height - (data[i + 1] / maxValue) * height;
                
                this.doc.line(x1, y1, x2, y2);
            }
        }
        
        // Leyenda
        this.doc.setFontSize(8);
        this.doc.setTextColor(47, 128, 237);
        this.doc.text('— Agua Útil', x + 5, y + height + 5);
        
        this.doc.setTextColor(0, 0, 0);
        this.doc.text(`Máx: ${Math.round(maxValue)} mm`, x + width - 30, y + height + 5);
    }

    addBalanceSummary(simulationData) {
        if (!simulationData) return;
        
        this.doc.setFontSize(10);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('Resumen del Período:', this.margin, this.currentY);
        this.currentY += 8;
        
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        
        const resumen = [
            `• Lluvia efectiva: ${Math.round(simulationData.lluviasEfectivasAcumuladas || 0)} mm`,
            `• Riego acumulado: ${Math.round(simulationData.riegoAcumulado || 0)} mm`,
            `• Agua útil actual: ${Math.round(simulationData.aguaUtil?.[simulationData.aguaUtil.length - 1] || 0)} mm`,
            `• % Agua útil: ${Math.round(simulationData.porcentajeAguaUtil || 0)}%`
        ];
        
        resumen.forEach(item => {
            this.doc.text(item, this.margin, this.currentY);
            this.currentY += 5;
        });
    }

    checkNewPage(requiredSpace) {
        if (this.currentY + requiredSpace > this.pageHeight - 50) {
            this.doc.addPage();
            this.addQarpanaTemplate();
            this.currentY = 60;
        }
    }

    getColorByPercentage(percentage) {
        if (percentage <= 25) return [239, 68, 68]; // Rojo
        if (percentage <= 50) return [249, 115, 22]; // Naranja
        if (percentage <= 75) return [255, 193, 7]; // Amarillo
        return [34, 197, 94]; // Verde
    }
}

export default PDFReportGenerator;