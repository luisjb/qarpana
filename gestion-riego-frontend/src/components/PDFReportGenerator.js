import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';

class PDFReportGenerator {
    constructor() {
        this.pdfDoc = null;
        this.currentPage = null;
        this.currentY = 0;
        this.pageHeight = 792; // A4 height in points (72 DPI)
        this.pageWidth = 612; // A4 width in points
        this.margin = 57; // 20mm en points
        this.contentWidth = 498; // A4 width minus margins
        this.templatePath = '/assets/hoja_membretada_2.pdf';
        this.font = null;
        this.boldFont = null;
        this.usingTemplate = false;
    }

    async generateReport(campoData, lotesData, recomendaciones) {
        try {
            // Crear documento PDF
            this.pdfDoc = await PDFDocument.create();
            
            // Cargar fuentes
            this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
            this.boldFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            // Verificar y cargar plantilla
            await this.loadTemplate();
            
            // Empezar después del header de la plantilla
            this.currentY = this.usingTemplate ? 600 : 650;
            
            // Agregar título del informe
            await this.addReportTitle(campoData.nombre_campo);
            
            // Capturar y agregar resumen de círculos (solo las cards)
            await this.addResumenCirculosFromPage(lotesData);
            
            // Agregar recomendaciones
            await this.addRecomendaciones(recomendaciones);
            
            // Agregar información detallada por lote
            for (const lote of lotesData) {
                await this.addLoteDetalleCompleto(lote);
            }
            
            // Generar y descargar el PDF
            const pdfBytes = await this.pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `Informe_Balance_Hidrico_${campoData.nombre_campo}_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error generando PDF:', error);
            throw error;
        }
    }

    async verifyTemplate() {
        try {
            console.log('🔍 Verificando plantilla en:', this.templatePath);
            
            const response = await fetch(this.templatePath);
            
            if (!response.ok) {
                console.warn(`❌ Template response not ok: ${response.status} - ${response.statusText}`);
                console.warn('URL completa:', window.location.origin + this.templatePath);
                return false;
            }
            
            const contentLength = response.headers.get('content-length');
            console.log('📏 Content-Length:', contentLength);
            
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
            
            // Verificar header PDF
            const bytes = new Uint8Array(arrayBuffer);
            const pdfHeader = String.fromCharCode(...bytes.slice(0, 4));
            console.log('🔤 PDF Header:', pdfHeader);
            
            if (pdfHeader !== '%PDF') {
                console.warn(`❌ Invalid PDF header: ${pdfHeader}`);
                // Mostrar más información del archivo
                const first20Bytes = String.fromCharCode(...bytes.slice(0, 20));
                console.warn('Primeros 20 bytes:', first20Bytes);
                return false;
            }
            
            console.log('✅ Template verified successfully');
            return { valid: true, arrayBuffer };
            
        } catch (error) {
            console.warn('❌ Error verifying template:', error);
            console.warn('Error details:', {
                message: error.message,
                stack: error.stack,
                templatePath: this.templatePath
            });
            return false;
        }
    }

    async loadTemplate() {
        try {
            console.log('Loading template from:', this.templatePath);
            
            const verification = await this.verifyTemplate();
            
            if (!verification) {
                throw new Error('Template verification failed');
            }
            
            const templateDoc = await PDFDocument.load(verification.arrayBuffer);
            const templatePages = templateDoc.getPages();
            
            if (templatePages.length === 0) {
                throw new Error('Template has no pages');
            }
            
            // Copiar la primera página de la plantilla
            const [templatePage] = await this.pdfDoc.copyPages(templateDoc, [0]);
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            
            // Dibujar la plantilla en la página actual
            const templateDims = templatePage.getSize();
            this.currentPage.drawPage(templatePage, {
                x: 0,
                y: 0,
                width: this.pageWidth,
                height: this.pageHeight,
            });
            
            this.usingTemplate = true;
            console.log('✅ Template loaded successfully');
            
        } catch (error) {
            console.warn('Failed to load template, using fallback:', error.message);
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
            if (this.usingTemplate) {
                const verification = await this.verifyTemplate();
                if (verification) {
                    const templateDoc = await PDFDocument.load(verification.arrayBuffer);
                    const [templatePage] = await this.pdfDoc.copyPages(templateDoc, [0]);
                    
                    this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                    this.currentPage.drawPage(templatePage, {
                        x: 0,
                        y: 0,
                        width: this.pageWidth,
                        height: this.pageHeight,
                    });
                } else {
                    this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                    await this.addFallbackHeader();
                }
            } else {
                this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                await this.addFallbackHeader();
            }
        } catch (error) {
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            await this.addFallbackHeader();
        }
        
        this.currentY = this.usingTemplate ? 600 : 650;
    }

    async addReportTitle(nombreCampo) {
        this.currentPage.drawText('INFORME DE BALANCE HIDRICO', {
            x: this.margin,
            y: this.currentY,
            size: 18,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 30;
        
        this.currentPage.drawText(`Campo: ${nombreCampo}`, {
            x: this.margin,
            y: this.currentY,
            size: 14,
            font: this.boldFont,
            color: rgb(0, 0, 0),
        });
        
        this.currentY -= 20;
        
        this.currentPage.drawText(`Fecha: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, {
            x: this.margin,
            y: this.currentY,
            size: 10,
            font: this.font,
            color: rgb(0.4, 0.4, 0.4),
        });
        
        this.currentY -= 40;
    }

    async addResumenCirculosFromPage(lotesData) {
        // Verificar si necesitamos nueva página
        if (this.currentY < 300) {
            await this.addNewPage();
        }
        
        // Título sección
        this.currentPage.drawText('RESUMEN DE CIRCULOS', {
            x: this.margin,
            y: this.currentY,
            size: 16,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 30;
        
        // Capturar SOLO las cards, no el selector
        await this.captureOnlyLotesCards(lotesData);
    }

    async captureOnlyLotesCards(lotesData) {
        try {
            // Buscar específicamente el grid de cards, evitando el selector
            const selectors = [
                '.MuiGrid-container > .MuiGrid-item', // Los items individuales
                '[data-testid="lotes-container"] > .MuiGrid-item',
                '.MuiCard-root' // Las cards directamente
            ];
            
            let lotesCards = null;
            
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0 && elements.length === lotesData.length) {
                    // Crear un contenedor temporal solo con las cards
                    const tempContainer = document.createElement('div');
                    tempContainer.style.display = 'flex';
                    tempContainer.style.flexWrap = 'wrap';
                    tempContainer.style.gap = '16px';
                    tempContainer.style.backgroundColor = '#ffffff';
                    tempContainer.style.padding = '20px';
                    
                    // Clonar y agregar las cards al contenedor temporal
                    elements.forEach(card => {
                        const clone = card.cloneNode(true);
                        clone.style.flex = '0 0 300px'; // Tamaño fijo para las cards
                        tempContainer.appendChild(clone);
                    });
                    
                    // Agregar temporalmente al DOM
                    document.body.appendChild(tempContainer);
                    
                    try {
                        console.log('Capturando cards de lotes...');
                        
                        const canvas = await html2canvas(tempContainer, {
                            backgroundColor: '#ffffff',
                            scale: 1.5,
                            useCORS: true,
                            allowTaint: true,
                            logging: false,
                            width: tempContainer.scrollWidth,
                            height: tempContainer.scrollHeight,
                        });
                        
                        // Remover el contenedor temporal
                        document.body.removeChild(tempContainer);
                        
                        // Convertir y agregar al PDF
                        const imgData = canvas.toDataURL('image/png');
                        const imgBytes = this.dataURLtoUint8Array(imgData);
                        
                        const image = await this.pdfDoc.embedPng(imgBytes);
                        const imageDims = image.scale(0.35); // Escalar para que entre bien
                        
                        // Verificar que la imagen entre en la página
                        if (this.currentY - imageDims.height < 100) {
                            await this.addNewPage();
                        }
                        
                        // Dibujar imagen en el PDF
                        this.currentPage.drawImage(image, {
                            x: this.margin,
                            y: this.currentY - imageDims.height,
                            width: imageDims.width,
                            height: imageDims.height,
                        });
                        
                        this.currentY -= imageDims.height + 20;
                        console.log('✅ Cards de lotes capturadas exitosamente');
                        return;
                        
                    } catch (error) {
                        // Remover el contenedor temporal si hay error
                        if (document.body.contains(tempContainer)) {
                            document.body.removeChild(tempContainer);
                        }
                        throw error;
                    }
                }
            }
            
            // Si no se pudieron capturar, usar fallback visual mejorado
            console.log('No se pudieron capturar las cards, usando fallback visual');
            await this.createVisualLotesCards(lotesData);
            
        } catch (error) {
            console.error('Error capturando cards de lotes:', error);
            await this.createVisualLotesCards(lotesData);
        }
    }

    async createVisualLotesCards(lotesData) {
        // Crear cards visuales similares a las de la página
        const cardWidth = 160;
        const cardHeight = 120;
        const spacing = 15;
        const cardsPerRow = 3;
        
        let currentRow = 0;
        let currentCol = 0;
        
        for (let i = 0; i < lotesData.length; i++) {
            const lote = lotesData[i];
            
            // Calcular posición
            const x = this.margin + (currentCol * (cardWidth + spacing));
            const y = this.currentY - (currentRow * (cardHeight + spacing));
            
            // Verificar si necesitamos nueva página
            if (y - cardHeight < 100) {
                await this.addNewPage();
                currentRow = 0;
                currentCol = 0;
                continue;
            }
            
            // Dibujar card estilo Material-UI
            await this.drawMaterialCard(lote, x, y - cardHeight, cardWidth, cardHeight);
            
            // Actualizar posición
            currentCol++;
            if (currentCol >= cardsPerRow) {
                currentCol = 0;
                currentRow++;
            }
        }
        
        // Actualizar currentY
        const totalRows = Math.ceil(lotesData.length / cardsPerRow);
        this.currentY -= (totalRows * (cardHeight + spacing)) + 20;
    }

    async drawMaterialCard(lote, x, y, width, height) {
        // Fondo de la card con sombra simulada
        this.currentPage.drawRectangle({
            x: x + 2,
            y: y - 2,
            width: width,
            height: height,
            color: rgb(0.9, 0.9, 0.9), // Sombra
        });
        
        this.currentPage.drawRectangle({
            x: x,
            y: y,
            width: width,
            height: height,
            color: rgb(1, 1, 1), // Fondo blanco
            borderColor: rgb(0.85, 0.85, 0.85),
            borderWidth: 1,
        });
        
        // Título del lote
        this.currentPage.drawText(lote.nombre_lote, {
            x: x + 10,
            y: y + height - 20,
            size: 12,
            font: this.boldFont,
            color: rgb(0, 0, 0),
        });
        
        // Subtítulo (cultivo - variedad)
        const subtitulo = `${lote.especie} - ${lote.variedad}`.substring(0, 25);
        this.currentPage.drawText(subtitulo, {
            x: x + 10,
            y: y + height - 35,
            size: 8,
            font: this.font,
            color: rgb(0.4, 0.4, 0.4),
        });
        
        // Campaña
        this.currentPage.drawText(`Campana: ${lote.campaña}`, {
            x: x + 10,
            y: y + height - 48,
            size: 8,
            font: this.font,
            color: rgb(0.4, 0.4, 0.4),
        });
        
        // Línea separadora
        this.currentPage.drawRectangle({
            x: x + 10,
            y: y + height - 55,
            width: width - 20,
            height: 1,
            color: rgb(0.9, 0.9, 0.9),
        });
        
        // Gauges visuales
        const gauge1X = x + 25;
        const gauge1Y = y + 35;
        const gauge2X = x + 95;
        const gauge2Y = y + 35;
        
        // Gauge 1 Metro
        this.drawVisualGauge(
            gauge1X, gauge1Y, 20,
            lote.waterData?.porcentajeAu1m || 0,
            '1 Metro'
        );
        
        // Gauge 2 Metros  
        this.drawVisualGauge(
            gauge2X, gauge2Y, 20,
            lote.waterData?.porcentajeAu2m || 0,
            '2 Metros'
        );
        
        // Valores en mm
        this.currentPage.drawText(`${Math.round(lote.waterData?.aguaUtil1m || 0)} mm`, {
            x: gauge1X - 8,
            y: y + 10,
            size: 7,
            font: this.font,
            color: rgb(0, 0, 0),
        });
        
        this.currentPage.drawText(`${Math.round(lote.waterData?.aguaUtil2m || 0)} mm`, {
            x: gauge2X - 8,
            y: y + 10,
            size: 7,
            font: this.font,
            color: rgb(0, 0, 0),
        });
    }

    drawVisualGauge(centerX, centerY, radius, percentage, label) {
        // Fondo del gauge
        this.currentPage.drawCircle({
            x: centerX,
            y: centerY,
            size: radius,
            color: rgb(0.9, 0.9, 0.9),
        });
        
        // Color según porcentaje
        const color = this.getColorByPercentage(percentage);
        
        // Círculo de progreso (simplificado)
        const progressRadius = radius * (percentage / 100);
        if (percentage > 0) {
            this.currentPage.drawCircle({
                x: centerX,
                y: centerY,
                size: Math.max(2, progressRadius),
                color: rgb(...color.map(c => c / 255)),
            });
        }
        
        // Texto del porcentaje
        this.currentPage.drawText(`${Math.round(percentage)}%`, {
            x: centerX - 8,
            y: centerY - 3,
            size: 8,
            font: this.boldFont,
            color: rgb(1, 1, 1),
        });
        
        // Label
        this.currentPage.drawText(label, {
            x: centerX - 15,
            y: centerY + radius + 5,
            size: 7,
            font: this.font,
            color: rgb(0.25, 0.66, 0.96),
        });
    }

    getColorByPercentage(percentage) {
        if (percentage <= 25) return [239, 68, 68]; // Rojo
        if (percentage <= 50) return [249, 115, 22]; // Naranja
        if (percentage <= 75) return [255, 193, 7]; // Amarillo
        return [34, 197, 94]; // Verde
    }

    async addRecomendaciones(recomendaciones) {
        if (this.currentY < 150) {
            await this.addNewPage();
        }
        
        this.currentPage.drawText('RECOMENDACIONES', {
            x: this.margin,
            y: this.currentY,
            size: 16,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 25;
        
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
                const fechaFormateada = new Date(fecha).toLocaleDateString('es-ES');
                
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
        // Nueva página para cada lote
        await this.addNewPage();
        
        // Título del lote
        this.currentPage.drawText(`DETALLE: ${lote.nombre_lote}`, {
            x: this.margin,
            y: this.currentY,
            size: 16,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 40;
        
        // Cards de información del lote con mejor formato
        await this.addEnhancedLoteCards(lote);
        
        // Intentar capturar el gráfico real
        await this.captureDetailedChart(lote);
    }

    async addEnhancedLoteCards(lote) {
        // Primera fila - Información básica
        const basicCards = [
            { title: 'Cultivo', value: lote.especie || 'N/A', color: rgb(0.26, 0.63, 0.28) },
            { title: 'Variedad', value: lote.variedad || 'N/A', color: rgb(0.26, 0.63, 0.28) },
            { title: 'Campana', value: lote.campaña || 'N/A', color: rgb(0.26, 0.63, 0.28) },
            { title: 'Estado Fenologico', value: lote.simulationData?.estadoFenologico || 'N/A', color: rgb(0.26, 0.63, 0.28) }
        ];
        
        this.drawCardRow(basicCards, this.currentY, 110, 50);
        this.currentY -= 70;
        
        // Segunda fila - Datos hídricos con estilo mejorado
        const waterCards = [
            { 
                title: 'Agua Util Inicial', 
                value: `1m: ${Math.round(lote.simulationData?.auInicial1m || 0)}mm\n2m: ${Math.round(lote.simulationData?.auInicial2m || 0)}mm`,
                color: rgb(0.25, 0.66, 0.96)
            },
            { 
                title: '% Agua Util Actual', 
                value: `1m: ${Math.round(lote.waterData?.porcentajeAu1m || 0)}%\n2m: ${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`,
                color: rgb(0.25, 0.66, 0.96)
            },
            { 
                title: 'Proyeccion 7 dias', 
                value: `1m: ${Math.round(lote.simulationData?.proyeccionAU1mDia8 || 0)}mm\n2m: ${Math.round(lote.simulationData?.proyeccionAU2mDia8 || 0)}mm`,
                color: rgb(0.25, 0.66, 0.96)
            }
        ];
        
        this.drawCardRow(waterCards, this.currentY, 150, 60);
        this.currentY -= 80;
    }

    drawCardRow(cards, startY, cardWidth, cardHeight) {
        const spacing = 15;
        
        cards.forEach((card, index) => {
            const x = this.margin + (index * (cardWidth + spacing));
            
            // Sombra
            this.currentPage.drawRectangle({
                x: x + 2,
                y: startY - cardHeight - 2,
                width: cardWidth,
                height: cardHeight,
                color: rgb(0.9, 0.9, 0.9),
            });
            
            // Fondo de la card
            this.currentPage.drawRectangle({
                x: x,
                y: startY - cardHeight,
                width: cardWidth,
                height: cardHeight,
                color: rgb(0.98, 0.98, 0.98),
                borderColor: card.color,
                borderWidth: 2,
            });
            
            // Título con color
            this.currentPage.drawText(card.title, {
                x: x + 8,
                y: startY - 18,
                size: 9,
                font: this.boldFont,
                color: card.color,
            });
            
            // Valor con líneas múltiples
            const lines = card.value.split('\n');
            lines.forEach((line, lineIndex) => {
                this.currentPage.drawText(line, {
                    x: x + 8,
                    y: startY - 35 - (lineIndex * 12),
                    size: 10,
                    font: this.font,
                    color: rgb(0, 0, 0),
                });
            });
        });
    }

    async captureDetailedChart(lote) {
        try {
            // Esperar un momento para que el gráfico se renderice completamente
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Buscar el canvas del gráfico de manera más específica
            const chartCanvases = Array.from(document.querySelectorAll('canvas'));
            
            let bestCanvas = null;
            let maxArea = 0;
            
            // Encontrar el canvas más grande (probablemente el gráfico principal)
            chartCanvases.forEach(canvas => {
                if (canvas.width > 300 && canvas.height > 200) {
                    const area = canvas.width * canvas.height;
                    if (area > maxArea) {
                        maxArea = area;
                        bestCanvas = canvas;
                    }
                }
            });
            
            // También intentar buscar por contexto Chart.js
            if (!bestCanvas) {
                chartCanvases.forEach(canvas => {
                    const ctx = canvas.getContext('2d');
                    if (ctx && canvas.width > 200) {
                        bestCanvas = canvas;
                    }
                });
            }
            
            if (bestCanvas) {
                console.log('📊 Capturando gráfico de balance...');
                console.log('Canvas dimensions:', bestCanvas.width, 'x', bestCanvas.height);
                
                // Crear una imagen directamente del canvas
                const dataURL = bestCanvas.toDataURL('image/png', 1.0);
                const imgBytes = this.dataURLtoUint8Array(dataURL);
                
                const image = await this.pdfDoc.embedPng(imgBytes);
                const originalDims = image.scale(1);
                
                // Escalar para que entre en la página
                const maxWidth = this.contentWidth;
                const maxHeight = 200;
                
                let scale = Math.min(
                    maxWidth / originalDims.width,
                    maxHeight / originalDims.height,
                    0.8 // Máximo 80% del tamaño original
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
                console.log('✅ Gráfico capturado exitosamente');
                
                // Agregar resumen de datos si están disponibles
                if (lote.simulationData) {
                    this.addBalanceSummary(lote.simulationData);
                }
                
            } else {
                console.log('❌ No se encontró canvas del gráfico');
                await this.addChartFallback();
            }
        } catch (error) {
            console.error('Error capturando gráfico:', error);
            await this.addChartFallback();
        }
    }

    async addChartFallback() {
        // Título del gráfico
        this.currentPage.drawText('Grafico de Balance Hidrico', {
            x: this.margin,
            y: this.currentY,
            size: 12,
            font: this.boldFont,
            color: rgb(0.26, 0.63, 0.28),
        });
        
        this.currentY -= 20;
        
        // Crear un área gris representando el gráfico
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.currentY - 150,
            width: this.contentWidth,
            height: 150,
            color: rgb(0.95, 0.95, 0.95),
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
        });
        
        // Texto explicativo
        this.currentPage.drawText('Grafico no disponible', {
            x: this.margin + this.contentWidth/2 - 50,
            y: this.currentY - 75,
            size: 12,
            font: this.font,
            color: rgb(0.6, 0.6, 0.6),
        });
        
        this.currentPage.drawText('(Para ver el grafico completo, acceder a la plataforma web)', {
            x: this.margin + 10,
            y: this.currentY - 95,
            size: 9,
            font: this.font,
            color: rgb(0.5, 0.5, 0.5),
        });
        
        this.currentY -= 170;
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