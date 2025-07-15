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
        
        // Múltiples rutas posibles para la plantilla
        this.templatePaths = [
            '../assets/hoja_membretada_2.pdf',
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

    async generateReport(campoData, lotesData, recomendaciones) {
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
            this.currentY = this.usingTemplate ? 600 : 650;
            
            // Agregar título del informe
            await this.addReportTitle(campoData.nombre_campo);
            
            // Esperar a que todos los gráficos se carguen antes de capturar
            console.log('⏳ Esperando carga de gráficos...');
            await this.waitForChartsToLoad();
            
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
            
            const response = await fetch(templatePath);
            
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
            
            // Si el archivo es muy pequeño (menos de 1KB), probablemente sea HTML de error
            if (arrayBuffer.byteLength < 1024) {
                console.warn(`❌ File too small (${arrayBuffer.byteLength} bytes), probably an error page`);
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
                console.warn('Primeros 50 bytes:', first50Bytes);
                return false;
            }
            
            console.log(`✅ Template verified successfully at: ${templatePath}`);
            return { valid: true, arrayBuffer };
            
        } catch (error) {
            console.warn(`❌ Error verifying template at ${templatePath}:`, error.message);
            return false;
        }
    }

    async loadTemplate() {
        try {
            console.log('📄 Intentando cargar plantilla desde múltiples rutas...');
            
            // Probar cada ruta hasta encontrar una que funcione
            for (const templatePath of this.templatePaths) {
                console.log(`🔍 Probando ruta: ${templatePath}`);
                
                const verification = await this.verifyTemplateAtPath(templatePath);
                
                if (verification) {
                    console.log(`✅ Plantilla encontrada en: ${templatePath}`);
                    
                    const templateDoc = await PDFDocument.load(verification.arrayBuffer);
                    const templatePages = templateDoc.getPages();
                    
                    if (templatePages.length === 0) {
                        console.warn('❌ Template has no pages');
                        continue;
                    }
                    
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
                    
                    this.usingTemplate = true;
                    this.templatePath = templatePath; // Guardar la ruta que funcionó
                    console.log('✅ Template loaded successfully');
                    return;
                }
            }
            
            // Si llegamos aquí, ninguna ruta funcionó
            console.error('❌ No se pudo cargar la plantilla desde ninguna ruta');
            console.log('📋 Rutas probadas:', this.templatePaths);
            console.log('🔧 Soluciones sugeridas:');
            console.log('   1. Verificar que el archivo hoja_membretada_2.pdf existe en la carpeta public/assets/');
            console.log('   2. Verificar que el archivo es un PDF válido (no HTML)');
            console.log('   3. Verificar los permisos del archivo');
            console.log('   4. Verificar la configuración del servidor web');
            
            throw new Error('No se pudo cargar la plantilla desde ninguna ruta');
            
        } catch (error) {
            console.warn('❌ Failed to load template, using fallback:', error.message);
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
            if (this.usingTemplate && this.templatePath) {
                const verification = await this.verifyTemplateAtPath(this.templatePath);
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
            console.warn('Error adding new page with template, using fallback:', error);
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
        
        // NUEVO: Intentar capturar gráfico con método mejorado
        console.log(`📊 Intentando capturar gráfico del lote: ${lote.nombre_lote}`);
        await this.captureDetailedChartImproved(lote);
    }

    async captureDetailedChartImproved(lote) {
        try {
            console.log('📊 Buscando gráficos en la página actual con método mejorado');
            
            // Esperar más tiempo para que los gráficos se carguen
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Buscar todos los posibles contenedores de gráficos
            const chartContainers = document.querySelectorAll([
                '.MuiPaper-root',
                '[data-testid*="chart"]',
                '.chart-container',
                '[class*="chart"]',
                '[class*="Chart"]'
            ].join(', '));
            
            console.log(`📋 Contenedores de gráficos encontrados: ${chartContainers.length}`);
            
            for (const container of chartContainers) {
                const canvas = container.querySelector('canvas');
                if (canvas && canvas.width > 300 && canvas.height > 150) {
                    console.log('✅ Canvas encontrado en contenedor:', {
                        width: canvas.width,
                        height: canvas.height,
                        containerClass: container.className
                    });
                    
                    const success = await this.processCanvasImage(canvas, lote);
                    if (success) return true;
                }
            }
            
            // Si no encontramos nada, buscar TODOS los canvas
            const allCanvases = Array.from(document.querySelectorAll('canvas'));
            console.log(`🎨 Total canvas en página: ${allCanvases.length}`);
            
            for (const canvas of allCanvases) {
                console.log(`Examinando canvas:`, {
                    width: canvas.width,
                    height: canvas.height,
                    id: canvas.id,
                    className: canvas.className,
                    parentClass: canvas.parentElement?.className
                });
                
                if (canvas.width > 200 && canvas.height > 100) {
                    const success = await this.processCanvasImage(canvas, lote);
                    if (success) return true;
                }
            }
            
            console.log('❌ No se encontraron canvas válidos');
            await this.addChartFallback();
            return false;
            
        } catch (error) {
            console.error('❌ Error en captura mejorada:', error);
            await this.addChartFallback();
            return false;
        }
    }

    async processCanvasImage(canvas, lote) {
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
            
            // Agregar resumen de datos si están disponibles
            if (lote.simulationData) {
                this.addBalanceSummary(lote.simulationData);
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Error procesando imagen del canvas:', error);
            return false;
        }
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

    async addChartFallback() {
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