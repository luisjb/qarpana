import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import axios from '../axiosConfig';

class PDFReportGenerator {
    constructor() {
        this.doc = null;
        this.currentY = 0;
        this.pageHeight = 297; // A4 height in mm
        this.margin = 20;
        this.contentWidth = 170; // A4 width minus margins
    }

    async generateReport(campoData, lotesData, recomendaciones) {
        this.doc = new jsPDF();
        this.currentY = this.margin;

        // Agregar header con logo y título
        await this.addHeader(campoData.nombre_campo);
        
        // Agregar resumen de círculos
        await this.addResumenCirculos(lotesData);
        
        // Agregar recomendaciones
        this.addRecomendaciones(recomendaciones);
        
        // Agregar información detallada por lote
        for (const lote of lotesData) {
            await this.addLoteDetalle(lote);
        }
        
        // Agregar footer en cada página
        this.addFooter();
        
        // Descargar el PDF
        const fileName = `Informe_Balance_Hidrico_${campoData.nombre_campo}_${format(new Date(), 'dd-MM-yyyy')}.pdf`;
        this.doc.save(fileName);
    }

    async addHeader(nombreCampo) {
        // Header con estilo QARPANA
        this.doc.setFillColor(0, 150, 136); // Verde QARPANA
        this.doc.rect(0, 0, 210, 15, 'F'); // Barra superior verde
        
        // Logo/Texto QARPANA
        this.doc.setTextColor(255, 255, 255);
        this.doc.setFontSize(14);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('QARPANA', this.margin, 10);
        
        // Reset color
        this.doc.setTextColor(0, 0, 0);
        this.currentY = 25;
        
        // Título del informe
        this.doc.setFontSize(20);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('INFORME DE BALANCE HÍDRICO', this.margin, this.currentY);
        
        this.currentY += 12;
        
        // Nombre del campo
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text(`Campo: ${nombreCampo}`, this.margin, this.currentY);
        
        this.currentY += 10;
        
        // Fecha del informe
        this.doc.setFontSize(10);
        this.doc.setTextColor(100, 100, 100);
        this.doc.text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, this.margin, this.currentY);
        
        // Línea separadora
        this.doc.setDrawColor(0, 150, 136);
        this.doc.setLineWidth(0.5);
        this.doc.line(this.margin, this.currentY + 5, this.margin + this.contentWidth, this.currentY + 5);
        
        this.doc.setTextColor(0, 0, 0); // Reset color
        this.currentY += 20;
    }

    async addResumenCirculos(lotesData) {
        this.checkNewPage(80);
        
        // Título sección
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text('RESUMEN DE CÍRCULOS', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 15;
        
        // Estadísticas generales
        this.addEstadisticasGenerales(lotesData);
        
        // Tabla resumen
        const headers = ['Lote', 'Cultivo/Variedad', 'Campaña', '% AU 1m', '% AU 2m', 'Estado'];
        const data = lotesData.map(lote => [
            lote.nombre_lote.substring(0, 12),
            `${lote.especie}/${lote.variedad}`.substring(0, 15),
            lote.campaña,
            `${Math.round(lote.waterData?.porcentajeAu1m || 0)}%`,
            `${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`,
            this.getEstadoTexto(lote.waterData?.porcentajeAu1m || 0)
        ]);
        
        this.addTable(headers, data);
        this.currentY += 15;
        
        // Gráfico de resumen
        await this.addGraficoResumen(lotesData);
    }

    addEstadisticasGenerales(lotesData) {
        const totalLotes = lotesData.length;
        const lotesCriticos = lotesData.filter(l => (l.waterData?.porcentajeAu1m || 0) <= 25).length;
        const lotesBuenos = lotesData.filter(l => (l.waterData?.porcentajeAu1m || 0) > 75).length;
        const promedioAU1m = lotesData.reduce((sum, l) => sum + (l.waterData?.porcentajeAu1m || 0), 0) / totalLotes;
        
        this.doc.setFontSize(11);
        this.doc.setFont('helvetica', 'normal');
        
        const estadisticas = [
            `Total de lotes: ${totalLotes}`,
            `Lotes en estado crítico: ${lotesCriticos} (${Math.round((lotesCriticos/totalLotes)*100)}%)`,
            `Lotes en buen estado: ${lotesBuenos} (${Math.round((lotesBuenos/totalLotes)*100)}%)`,
            `Promedio agua útil 1m: ${Math.round(promedioAU1m)}%`
        ];
        
        estadisticas.forEach(stat => {
            this.doc.text(`• ${stat}`, this.margin, this.currentY);
            this.currentY += 5;
        });
        
        this.currentY += 10;
    }

    async addGraficoResumen(lotesData) {
        this.checkNewPage(100);
        
        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('Distribución de Estados de Agua Útil por Lote', this.margin, this.currentY);
        this.currentY += 15;
        
        // Crear gráfico de barras horizontales
        const maxNombreLength = 15;
        const barAreaWidth = 100;
        const barHeight = 6;
        const spacing = 10;
        
        lotesData.forEach((lote, index) => {
            const y = this.currentY + (index * spacing);
            
            // Verificar si necesita nueva página
            if (y > this.pageHeight - 40) {
                this.doc.addPage();
                this.currentY = this.margin;
                return;
            }
            
            // Nombre del lote (truncado)
            this.doc.setFontSize(8);
            this.doc.setFont('helvetica', 'normal');
            const nombreTruncado = lote.nombre_lote.length > maxNombreLength 
                ? lote.nombre_lote.substring(0, maxNombreLength) + '...'
                : lote.nombre_lote;
            this.doc.text(nombreTruncado, this.margin, y + 4);
            
            const startX = this.margin + 40;
            
            // Barra para 1m
            const porcentaje1m = lote.waterData?.porcentajeAu1m || 0;
            const width1m = (porcentaje1m / 100) * (barAreaWidth / 2.2);
            
            this.doc.setFillColor(...this.getColorByPercentage(porcentaje1m));
            this.doc.rect(startX, y, width1m, barHeight, 'F');
            
            // Borde de la barra 1m
            this.doc.setDrawColor(200, 200, 200);
            this.doc.setLineWidth(0.1);
            this.doc.rect(startX, y, barAreaWidth / 2.2, barHeight);
            
            // Etiqueta 1m
            this.doc.setFontSize(7);
            this.doc.text(`1m: ${Math.round(porcentaje1m)}%`, startX + (barAreaWidth / 2.2) + 2, y + 4);
            
            // Barra para 2m
            const porcentaje2m = lote.waterData?.porcentajeAu2m || 0;
            const width2m = (porcentaje2m / 100) * (barAreaWidth / 2.2);
            const startX2m = startX + (barAreaWidth / 2.2) + 25;
            
            this.doc.setFillColor(...this.getColorByPercentage(porcentaje2m));
            this.doc.rect(startX2m, y, width2m, barHeight, 'F');
            
            // Borde de la barra 2m
            this.doc.rect(startX2m, y, barAreaWidth / 2.2, barHeight);
            
            // Etiqueta 2m
            this.doc.text(`2m: ${Math.round(porcentaje2m)}%`, startX2m + (barAreaWidth / 2.2) + 2, y + 4);
        });
        
        this.currentY += (lotesData.length * spacing) + 15;
    }

    addRecomendaciones(recomendaciones) {
        this.checkNewPage(60);
        
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text('RECOMENDACIONES', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 15;
        
        if (recomendaciones && recomendaciones.length > 0) {
            // Solo mostrar la última recomendación (que debería ser la única que llegue)
            const recomendacion = recomendaciones[0]; // Tomar la primera (y única) recomendación
            
            this.doc.setFontSize(10);
            this.doc.setFont('helvetica', 'normal');
            
            const texto = recomendacion.texto || 
                         recomendacion.descripcion || 
                         recomendacion.recomendacion || 
                         String(recomendacion);
            
            // Dividir texto largo en líneas
            const lines = this.doc.splitTextToSize(texto, this.contentWidth - 10);
            
            this.doc.text(lines, this.margin, this.currentY);
            this.currentY += (lines.length * 4) + 8;
            
            // Agregar fecha de la recomendación si está disponible
            if (recomendacion.fecha_creacion || recomendacion.fecha) {
                this.doc.setFontSize(8);
                this.doc.setFont('helvetica', 'italic');
                this.doc.setTextColor(100, 100, 100);
                const fecha = recomendacion.fecha_creacion || recomendacion.fecha;
                const fechaFormateada = new Date(fecha).toLocaleDateString('es-ES');
                this.doc.text(`Fecha: ${fechaFormateada}`, this.margin, this.currentY);
                this.doc.setTextColor(0, 0, 0);
                this.currentY += 6;
            }
        } else {
            this.doc.setFontSize(10);
            this.doc.setFont('helvetica', 'italic');
            this.doc.setTextColor(150, 150, 150);
            this.doc.text('No hay recomendaciones disponibles para este campo en este momento.', this.margin, this.currentY);
            this.doc.setTextColor(0, 0, 0);
            this.currentY += 8;
        }
        
        this.currentY += 15;
    }

    async addLoteDetalle(lote) {
        // Nueva página para cada lote
        this.doc.addPage();
        this.currentY = this.margin;
        
        // Título del lote
        this.doc.setFontSize(16);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text(`DETALLE DEL LOTE: ${lote.nombre_lote}`, this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 20;
        
        // Datos agronómicos y climáticos en dos columnas
        await this.addDatosLoteEnColumnas(lote);
        
        // Balance hídrico
        if (lote.simulationData) {
            await this.addBalanceHidricoChart(lote);
        }
    }

    async addDatosLoteEnColumnas(lote) {
        const colWidth = this.contentWidth / 2 - 5;
        
        // Columna izquierda - Datos Agronómicos
        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text('Datos Agronómicos', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        
        const startY = this.currentY + 8;
        let leftY = startY;
        
        const datosAgronomicos = [
            ['Cultivo:', lote.especie || 'N/A'],
            ['Variedad:', lote.variedad || 'N/A'],
            ['Campaña:', lote.campaña || 'N/A'],
            ['Fecha Siembra:', lote.fecha_siembra ? format(new Date(lote.fecha_siembra), 'dd/MM/yyyy') : 'N/A'],
            ['Estado Fenológico:', lote.simulationData?.estadoFenologico || 'N/A']
        ];
        
        this.doc.setFontSize(9);
        datosAgronomicos.forEach(([label, value]) => {
            this.doc.setFont('helvetica', 'bold');
            this.doc.text(label, this.margin, leftY);
            this.doc.setFont('helvetica', 'normal');
            this.doc.text(value, this.margin + 30, leftY);
            leftY += 5;
        });
        
        // Columna derecha - Estado Hídrico
        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text('Estado Hídrico Actual', this.margin + colWidth + 10, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        
        let rightY = startY;
        
        const datosHidricos = [
            ['AU 1m:', `${Math.round(lote.waterData?.aguaUtil1m || 0)} mm`],
            ['% AU 1m:', `${Math.round(lote.waterData?.porcentajeAu1m || 0)}%`],
            ['AU 2m:', `${Math.round(lote.waterData?.aguaUtil2m || 0)} mm`],
            ['% AU 2m:', `${Math.round(lote.waterData?.porcentajeAu2m || 0)}%`],
            ['Estado:', this.getEstadoTexto(lote.waterData?.porcentajeAu1m || 0)]
        ];
        
        this.doc.setFontSize(9);
        datosHidricos.forEach(([label, value]) => {
            this.doc.setFont('helvetica', 'bold');
            this.doc.text(label, this.margin + colWidth + 10, rightY);
            this.doc.setFont('helvetica', 'normal');
            this.doc.text(value, this.margin + colWidth + 35, rightY);
            rightY += 5;
        });
        
        this.currentY = Math.max(leftY, rightY) + 15;
    }

    async addBalanceHidricoChart(lote) {
        this.checkNewPage(80);
        
        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 150, 136);
        this.doc.text('Balance Hídrico - Últimos 30 días', this.margin, this.currentY);
        this.doc.setTextColor(0, 0, 0);
        this.currentY += 15;
        
        // Datos del balance (últimos 30 registros)
        const simulationData = lote.simulationData;
        if (simulationData && simulationData.fechas && simulationData.fechas.length > 0) {
            const startIndex = Math.max(0, simulationData.fechas.length - 30);
            const fechas = simulationData.fechas.slice(startIndex);
            const aguaUtil = simulationData.aguaUtil.slice(startIndex);
            const lluvias = simulationData.lluvias.slice(startIndex);
            const riego = simulationData.riego.slice(startIndex);
            
            // Crear un mini gráfico en ASCII/texto
            this.addSimpleChart(fechas, aguaUtil, lluvias, riego);
        } else {
            this.doc.setFontSize(10);
            this.doc.setFont('helvetica', 'italic');
            this.doc.text('No hay datos suficientes para mostrar el gráfico de balance hídrico.', this.margin, this.currentY);
            this.currentY += 10;
        }
        
        // Resumen numérico del período
        if (lote.simulationData) {
            this.addResumenNumerico(lote.simulationData);
        }
    }

    addSimpleChart(fechas, aguaUtil, lluvias, riego) {
        // Área del gráfico
        const chartWidth = this.contentWidth;
        const chartHeight = 50;
        const chartStartY = this.currentY;
        
        // Fondo del gráfico
        this.doc.setFillColor(248, 248, 248);
        this.doc.rect(this.margin, chartStartY, chartWidth, chartHeight, 'F');
        
        // Bordes
        this.doc.setDrawColor(200, 200, 200);
        this.doc.rect(this.margin, chartStartY, chartWidth, chartHeight);
        
        // Encontrar valores máximos para escalar
        const maxAguaUtil = Math.max(...aguaUtil);
        const maxPrecip = Math.max(...lluvias, ...riego);
        
        if (maxAguaUtil > 0) {
            // Dibujar línea de agua útil
            this.doc.setDrawColor(0, 100, 200);
            this.doc.setLineWidth(1);
            
            for (let i = 0; i < aguaUtil.length - 1; i++) {
                const x1 = this.margin + (i / (aguaUtil.length - 1)) * chartWidth;
                const y1 = chartStartY + chartHeight - (aguaUtil[i] / maxAguaUtil) * chartHeight;
                const x2 = this.margin + ((i + 1) / (aguaUtil.length - 1)) * chartWidth;
                const y2 = chartStartY + chartHeight - (aguaUtil[i + 1] / maxAguaUtil) * chartHeight;
                
                this.doc.line(x1, y1, x2, y2);
            }
        }
        
        // Etiquetas
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'normal');
        this.doc.text('Agua Útil (línea azul)', this.margin, chartStartY + chartHeight + 5);
        this.doc.text(`Máx: ${Math.round(maxAguaUtil)} mm`, this.margin, chartStartY + chartHeight + 10);
        
        // Fechas de referencia
        if (fechas.length > 0) {
            const fechaInicio = format(new Date(fechas[0]), 'dd/MM');
            const fechaFin = format(new Date(fechas[fechas.length - 1]), 'dd/MM');
            this.doc.text(fechaInicio, this.margin, chartStartY + chartHeight + 15);
            this.doc.text(fechaFin, this.margin + chartWidth - 15, chartStartY + chartHeight + 15);
        }
        
        this.currentY = chartStartY + chartHeight + 25;
    }

    addResumenNumerico(simulationData) {
        this.doc.setFontSize(10);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('Resumen del Período:', this.margin, this.currentY);
        this.currentY += 8;
        
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(9);
        
        const resumen = [
            `• Lluvia efectiva acumulada: ${Math.round(simulationData.lluviasEfectivasAcumuladas || 0)} mm`,
            `• Riego acumulado: ${Math.round(simulationData.riegoAcumulado || 0)} mm`,
            `• Agua útil actual: ${Math.round(simulationData.aguaUtil[simulationData.aguaUtil.length - 1] || 0)} mm`,
            `• Porcentaje de agua útil: ${Math.round(simulationData.porcentajeAguaUtil || 0)}%`
        ];
        
        resumen.forEach(item => {
            this.doc.text(item, this.margin, this.currentY);
            this.currentY += 4;
        });
        
        this.currentY += 10;
    }

    addTable(headers, data) {
        const rowHeight = 8;
        const colWidth = this.contentWidth / headers.length;
        
        // Headers
        this.doc.setFontSize(9);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFillColor(0, 150, 136);
        this.doc.setTextColor(255, 255, 255);
        
        headers.forEach((header, index) => {
            const x = this.margin + (index * colWidth);
            this.doc.rect(x, this.currentY, colWidth, rowHeight, 'F');
            this.doc.rect(x, this.currentY, colWidth, rowHeight);
            this.doc.text(header, x + 2, this.currentY + 5);
        });
        
        this.currentY += rowHeight;
        this.doc.setTextColor(0, 0, 0);
        
        // Data rows
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(8);
        
        data.forEach((row, rowIndex) => {
            this.checkNewPage(rowHeight + 5);
            
            // Alternar color de fondo
            if (rowIndex % 2 === 0) {
                this.doc.setFillColor(250, 250, 250);
                this.doc.rect(this.margin, this.currentY, this.contentWidth, rowHeight, 'F');
            }
            
            row.forEach((cell, index) => {
                const x = this.margin + (index * colWidth);
                this.doc.rect(x, this.currentY, colWidth, rowHeight);
                
                const cellText = String(cell);
                this.doc.text(cellText, x + 2, this.currentY + 5);
            });
            
            this.currentY += rowHeight;
        });
    }

    addFooter() {
        const totalPages = this.doc.internal.getNumberOfPages();
        
        for (let i = 1; i <= totalPages; i++) {
            this.doc.setPage(i);
            
            // Línea separadora
            this.doc.setDrawColor(0, 150, 136);
            this.doc.setLineWidth(0.3);
            this.doc.line(this.margin, 280, this.margin + this.contentWidth, 280);
            
            // Información de contacto
            this.doc.setFontSize(8);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setTextColor(100, 100, 100);
            this.doc.text('QARPANA - Tecnología para el Agro', this.margin, 285);
            this.doc.text('info@qarpana.com.ar | 3525 640098', this.margin, 290);
            
            // Número de página
            this.doc.text(`Página ${i} de ${totalPages}`, this.margin + this.contentWidth - 30, 290);
        }
    }

    checkNewPage(requiredSpace) {
        if (this.currentY + requiredSpace > this.pageHeight - 30) {
            this.doc.addPage();
            this.currentY = this.margin;
        }
    }

    getColorByPercentage(percentage) {
        if (percentage <= 25) return [239, 68, 68]; // Rojo
        if (percentage <= 50) return [249, 115, 22]; // Naranja
        if (percentage <= 75) return [255, 193, 7]; // Amarillo
        return [34, 197, 94]; // Verde
    }

    getEstadoTexto(percentage) {
        if (percentage <= 25) return 'Crítico';
        if (percentage <= 50) return 'Bajo';
        if (percentage <= 75) return 'Medio';
        return 'Bueno';
    }
}

export default PDFReportGenerator;