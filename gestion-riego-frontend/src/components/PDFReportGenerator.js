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
        this.templatePath = '../assets/hoja_membretada_2.pdf';
        this.font = null;
        this.boldFont = null;
    }

    async generateReport(campoData, lotesData, recomendaciones) {
        try {
            // Crear documento PDF
            this.pdfDoc = await PDFDocument.create();
            
            // Cargar fuentes
            this.font = await this.pdfDoc.embedFont(StandardFonts.Helvetica);
            this.boldFont = await this.pdfDoc.embedFont(StandardFonts.HelveticaBold);
            
            // Cargar y usar la plantilla
            await this.loadTemplate();
            
            // Empezar después del header de la plantilla
            this.currentY = 650; // Ajustar según tu plantilla
            
            // Agregar título del informe
            await this.addReportTitle(campoData.nombre_campo);
            
            // Capturar y agregar resumen de círculos
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

    async loadTemplate() {
        try {
            // Intentar cargar la plantilla PDF
            const templateResponse = await fetch(this.templatePath);
            
            if (!templateResponse.ok) {
                throw new Error(`HTTP error! status: ${templateResponse.status}`);
            }
            
            const templateBytes = await templateResponse.arrayBuffer();
            
            // Verificar que el archivo no esté vacío
            if (templateBytes.byteLength === 0) {
                throw new Error('El archivo de plantilla está vacío');
            }
            
            const templateDoc = await PDFDocument.load(templateBytes);
            
            // Copiar la primera página de la plantilla
            const [templatePage] = await this.pdfDoc.copyPages(templateDoc, [0]);
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            
            // Dibujar la plantilla en la página actual
            this.currentPage.drawPage(templatePage, {
                x: 0,
                y: 0,
                width: this.pageWidth,
                height: this.pageHeight,
            });
            
            console.log('Plantilla cargada exitosamente');
            
        } catch (error) {
            console.warn('No se pudo cargar la plantilla, creando página en blanco:', error.message);
            // Si no se puede cargar la plantilla, crear página en blanco
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            await this.addFallbackHeader();
        }
    }

    async addFallbackHeader() {
        // Header de respaldo si no se puede cargar la plantilla
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

        // Línea decorativa
        this.currentPage.drawRectangle({
            x: this.margin,
            y: this.pageHeight - 70,
            width: this.contentWidth,
            height: 2,
            color: rgb(0.54, 0.76, 0.29),
        });

        // Footer simple
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
        // Agregar nueva página con plantilla
        try {
            const templateResponse = await fetch(this.templatePath);
            if (templateResponse.ok && templateResponse.headers.get('content-length') !== '0') {
                const templateBytes = await templateResponse.arrayBuffer();
                if (templateBytes.byteLength > 0) {
                    const templateDoc = await PDFDocument.load(templateBytes);
                    const [templatePage] = await this.pdfDoc.copyPages(templateDoc, [0]);
                    
                    this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
                    this.currentPage.drawPage(templatePage, {
                        x: 0,
                        y: 0,
                        width: this.pageWidth,
                        height: this.pageHeight,
                    });
                } else {
                    throw new Error('Archivo vacío');
                }
            } else {
                throw new Error('No se pudo cargar');
            }
        } catch (error) {
            this.currentPage = this.pdfDoc.addPage([this.pageWidth, this.pageHeight]);
            await this.addFallbackHeader();
        }
        
        this.currentY = 650; // Reset Y position
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
        
        // Capturar el resumen de círculos de la página actual
        await this.captureResumenCirculos(lotesData);
        
        this.currentY -= 200; // Espacio para la imagen capturada
    }

    async captureResumenCirculos(lotesData) {
        try {
            // Buscar el contenedor de lotes en el DOM
            const lotesContainer = document.querySelector('[data-testid="lotes-container"]') || 
                                 document.querySelector('#resumen-circulos') ||
                                 document.querySelector('.MuiGrid-container');
            
            if (lotesContainer) {
                console.log('Capturando contenedor de lotes...');
                
                // Capturar el contenedor
                const canvas = await html2canvas(lotesContainer, {
                    backgroundColor: '#ffffff',
                    scale: 1.5,
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    width: lotesContainer.scrollWidth,
                    height: lotesContainer.scrollHeight,
                });
                
                // Convertir canvas a imagen
                const imgData = canvas.toDataURL('image/png');
                const imgBytes = this.dataURLtoUint8Array(imgData);
                
                // Embedder imagen en PDF
                const image = await this.pdfDoc.embedPng(imgBytes);
                const imageDims = image.scale(0.4); // Escalar para que entre en la página
                
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
                console.log('Imagen del resumen capturada exitosamente');
                
            } else {
                console.log('No se encontró contenedor, usando fallback');
                await this.addLotesTableFallback(lotesData);
            }
        } catch (error) {
            console.error('Error capturando resumen de círculos:', error);
            await this.addLotesTableFallback(lotesData);
        }
    }

    async addLotesTableFallback(lotesData) {
        // Fallback: crear tabla simple de lotes
        const rowHeight = 20;
        const startY = this.currentY;
        
        // Headers
        this.currentPage.drawText('Lote', { x: this.margin, y: startY, size: 10, font: this.boldFont });
        this.currentPage.drawText('Cultivo', { x: this.margin + 80, y: startY, size: 10, font: this.boldFont });
        this.currentPage.drawText('% AU 1m', { x: this.margin + 160, y: startY, size: 10, font: this.boldFont });
        this.currentPage.drawText('% AU 2m', { x: this.margin + 220, y: startY, size: 10, font: this.boldFont });
        
        let currentRowY = startY - rowHeight;
        
        lotesData.forEach((lote) => {
            if (currentRowY < 100) {
                // Necesitamos nueva página
                this.addNewPage();
                currentRowY = 650;
            }
            
            this.currentPage.drawText(lote.nombre_lote.substring(0, 12), { 
                x: this.margin, y: currentRowY, size: 9, font: this.font 
            });
            this.currentPage.drawText(`${lote.especie}`, { 
                x: this.margin + 80, y: currentRowY, size: 9, font: this.font 
            });
            this.currentPage.drawText(`${Math.round(lote.waterData?.porcentajeAu1m || 0)}%`, { 
                x: this.margin + 160, y: currentRowY, size: 9, font: this.font 
            });
            this.currentPage.drawText(`${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`, { 
                x: this.margin + 220, y: currentRowY, size: 9, font: this.font 
            });
            
            currentRowY -= rowHeight;
        });
        
        this.currentY = currentRowY - 20;
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
        
        // Datos básicos del lote
        await this.addLoteBasicInfo(lote);
        
        // Capturar el gráfico de balance hídrico si está disponible
        if (lote.simulationData) {
            await this.captureBalanceChart();
        }
    }

    async addLoteBasicInfo(lote) {
        // Crear cards simples para los datos de simulación
        const cardWidth = 120;
        const cardHeight = 60;
        const spacing = 10;
        
        // Primera fila de cards
        const cards = [
            { title: 'Cultivo', value: lote.especie || 'N/A' },
            { title: 'Variedad', value: lote.variedad || 'N/A' },
            { title: 'Campana', value: lote.campaña || 'N/A' },
            { title: 'Estado Fenologico', value: lote.simulationData?.estadoFenologico || 'N/A' }
        ];
        
        cards.forEach((card, index) => {
            const x = this.margin + (index * (cardWidth + spacing));
            const y = this.currentY;
            
            // Fondo de la card
            this.currentPage.drawRectangle({
                x: x,
                y: y - cardHeight,
                width: cardWidth,
                height: cardHeight,
                color: rgb(0.97, 0.98, 0.99),
                borderColor: rgb(0.9, 0.9, 0.9),
                borderWidth: 1,
            });
            
            // Título
            this.currentPage.drawText(card.title, {
                x: x + 5,
                y: y - 15,
                size: 9,
                font: this.boldFont,
                color: rgb(0.26, 0.63, 0.28),
            });
            
            // Valor
            const valueLines = this.splitTextToLines(card.value, cardWidth - 10, 10);
            valueLines.forEach((line, lineIndex) => {
                this.currentPage.drawText(line, {
                    x: x + 5,
                    y: y - 30 - (lineIndex * 12),
                    size: 10,
                    font: this.font,
                    color: rgb(0, 0, 0),
                });
            });
        });
        
        this.currentY -= cardHeight + 20;
        
        // Segunda fila - Cards de agua útil (sin emojis)
        await this.addWaterCardsDetailed(lote);
    }

    async addWaterCardsDetailed(lote) {
        const cardWidth = 160;
        const cardHeight = 80;
        const spacing = 10;
        
        // Cards de agua útil (SIN EMOJIS para evitar errores de encoding)
        const waterCards = [
            {
                title: 'Agua Util Inicial',
                content: [
                    `1 Metro: ${Math.round(lote.simulationData?.auInicial1m || 0)} mm`,
                    `2 Metros: ${Math.round(lote.simulationData?.auInicial2m || 0)} mm`
                ]
            },
            {
                title: '% Agua Util Actual',
                content: [
                    `1m: ${Math.round(lote.waterData?.porcentajeAu1m || 0)}%`,
                    `2m: ${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`
                ]
            },
            {
                title: 'Proyeccion 7 dias',
                content: [
                    `1m: ${Math.round(lote.simulationData?.proyeccionAU1mDia8 || 0)} mm`,
                    `2m: ${Math.round(lote.simulationData?.proyeccionAU2mDia8 || 0)} mm`
                ]
            }
        ];
        
        waterCards.forEach((card, index) => {
            const x = this.margin + (index * (cardWidth + spacing));
            const y = this.currentY;
            
            // Fondo de la card
            this.currentPage.drawRectangle({
                x: x,
                y: y - cardHeight,
                width: cardWidth,
                height: cardHeight,
                color: rgb(0.97, 0.98, 0.99),
                borderColor: rgb(0.25, 0.66, 0.96),
                borderWidth: 1,
            });
            
            // Título (SIN EMOJI)
            this.currentPage.drawText(card.title, {
                x: x + 5,
                y: y - 15,
                size: 10,
                font: this.boldFont,
                color: rgb(0.25, 0.66, 0.96),
            });
            
            // Contenido
            card.content.forEach((line, lineIndex) => {
                this.currentPage.drawText(line, {
                    x: x + 5,
                    y: y - 35 - (lineIndex * 15),
                    size: 9,
                    font: this.font,
                    color: rgb(0, 0, 0),
                });
            });
        });
        
        this.currentY -= cardHeight + 30;
    }

    async captureBalanceChart() {
        try {
            // Buscar el canvas del gráfico de Chart.js de manera más específica
            const chartCanvases = document.querySelectorAll('canvas');
            let chartCanvas = null;
            
            // Buscar el canvas que probablemente sea el gráfico
            for (let canvas of chartCanvases) {
                const parent = canvas.closest('[data-testid="balance-chart"]') || 
                              canvas.closest('.MuiPaper-root');
                if (parent && canvas.width > 300) { // Asumimos que el gráfico es más grande
                    chartCanvas = canvas;
                    break;
                }
            }
            
            if (!chartCanvas && chartCanvases.length > 0) {
                // Si no encontramos uno específico, usar el más grande
                chartCanvas = Array.from(chartCanvases).reduce((prev, current) => {
                    return (current.width * current.height) > (prev.width * prev.height) ? current : prev;
                });
            }
            
            if (chartCanvas) {
                console.log('Capturando gráfico de balance...');
                
                const canvas = await html2canvas(chartCanvas, {
                    backgroundColor: '#ffffff',
                    scale: 1,
                    logging: false,
                });
                
                const imgData = canvas.toDataURL('image/png');
                const imgBytes = this.dataURLtoUint8Array(imgData);
                
                const image = await this.pdfDoc.embedPng(imgBytes);
                const imageDims = image.scale(0.7);
                
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
                
                // Dibujar imagen del gráfico
                this.currentPage.drawImage(image, {
                    x: this.margin,
                    y: this.currentY - imageDims.height,
                    width: imageDims.width,
                    height: imageDims.height,
                });
                
                this.currentY -= imageDims.height + 20;
                console.log('Gráfico capturado exitosamente');
                
            } else {
                console.log('No se encontró canvas del gráfico');
                // Fallback si no se puede capturar el gráfico
                this.currentPage.drawText('Grafico de Balance Hidrico', {
                    x: this.margin,
                    y: this.currentY,
                    size: 12,
                    font: this.boldFont,
                    color: rgb(0.26, 0.63, 0.28),
                });
                
                this.currentY -= 20;
                
                this.currentPage.drawText('(Grafico no disponible - no se pudo capturar)', {
                    x: this.margin,
                    y: this.currentY,
                    size: 10,
                    font: this.font,
                    color: rgb(0.6, 0.6, 0.6),
                });
                
                this.currentY -= 30;
            }
        } catch (error) {
            console.error('Error capturando gráfico:', error);
        }
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