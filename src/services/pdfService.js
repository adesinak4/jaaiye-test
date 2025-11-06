const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;

class PDFService {
  /**
   * Generate a branded PDF ticket with QR code
   * @param {Object} ticket - Ticket object with eventId populated
   * @param {Object} options - Additional options
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateTicketPDF(ticket, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Extract ticket data
        const event = ticket.eventId || {};
        const ticketId = ticket.publicId || ticket._id?.toString() || 'N/A';
        const qrCodeDataUrl = ticket.qrCode;

        // Brand colors
        const primaryColor = '#0040CC'; // Jaaiye blue
        const secondaryColor = '#0F172A';
        const textColor = '#64748B';

        // Header with brand
        doc.rect(0, 0, doc.page.width, 120)
          .fillColor(primaryColor)
          .fill();

        // Logo placeholder (you can add actual logo image here)
        doc.fillColor('#FFFFFF')
          .fontSize(32)
          .font('Helvetica-Bold')
          .text('JAAIYE', 50, 40, { align: 'center' });

        doc.fillColor('#FFFFFF')
          .fontSize(14)
          .font('Helvetica')
          .text('Event Ticket', 50, 75, { align: 'center' });

        // Main content area
        let yPosition = 150;

        // Event Title
        doc.fillColor(secondaryColor)
          .fontSize(24)
          .font('Helvetica-Bold')
          .text(event.title || 'Event', 50, yPosition, {
            width: doc.page.width - 100,
            align: 'center'
          });

        yPosition += 40;

        // Event Details Box
        const detailsBoxY = yPosition;
        doc.rect(50, detailsBoxY, doc.page.width - 100, 120)
          .fillColor('#F8FAFC')
          .fill()
          .strokeColor('#E2E8F0')
          .lineWidth(1)
          .stroke();

        yPosition += 20;

        // Date
        if (event.startTime) {
          const eventDate = new Date(event.startTime);
          doc.fillColor(secondaryColor)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Date:', 70, yPosition);

          doc.fillColor(textColor)
            .fontSize(12)
            .font('Helvetica')
            .text(eventDate.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }), 120, yPosition);

          yPosition += 20;

          // Time
          doc.fillColor(secondaryColor)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Time:', 70, yPosition);

          doc.fillColor(textColor)
            .fontSize(12)
            .font('Helvetica')
            .text(eventDate.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }), 120, yPosition);

          yPosition += 20;
        }

        // Venue
        if (event.venue || event.location) {
          doc.fillColor(secondaryColor)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Venue:', 70, yPosition);

          doc.fillColor(textColor)
            .fontSize(12)
            .font('Helvetica')
            .text(event.venue || event.location, 120, yPosition);

          yPosition += 20;
        }

        // Ticket Type
        if (ticket.ticketTypeName) {
          doc.fillColor(secondaryColor)
            .fontSize(12)
            .font('Helvetica-Bold')
            .text('Ticket Type:', 70, yPosition);

          doc.fillColor(textColor)
            .fontSize(12)
            .font('Helvetica')
            .text(ticket.ticketTypeName, 120, yPosition);
        }

        yPosition += 60;

        // QR Code Section
        const qrBoxSize = 200;
        if (qrCodeDataUrl) {
          // QR Code Box
          const qrX = (doc.page.width - qrBoxSize) / 2;
          const qrY = yPosition;

          doc.rect(qrX, qrY, qrBoxSize, qrBoxSize + 40)
            .fillColor('#FFFFFF')
            .fill()
            .strokeColor('#E2E8F0')
            .lineWidth(2)
            .stroke();

          // Convert data URL to buffer
          const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
          const qrBuffer = Buffer.from(base64Data, 'base64');

          // Add QR code image
          doc.image(qrBuffer, qrX + 10, qrY + 10, {
            width: qrBoxSize - 20,
            height: qrBoxSize - 20,
            align: 'center'
          });

          // Ticket ID below QR code
          doc.fillColor(secondaryColor)
            .fontSize(10)
            .font('Courier')
            .text(`Ticket ID: ${ticketId}`, qrX, qrY + qrBoxSize - 10, {
              width: qrBoxSize,
              align: 'center'
            });

          yPosition += qrBoxSize + 60;
        } else {
          // If no QR code, still add space
          yPosition += qrBoxSize + 60;
        }

        // Footer Information
        doc.fillColor(textColor)
          .fontSize(10)
          .font('Helvetica')
          .text('Please present this QR code at the event entrance for check-in.', 50, yPosition, {
            width: doc.page.width - 100,
            align: 'center'
          });

        yPosition += 20;

        doc.fillColor(textColor)
          .fontSize(9)
          .font('Helvetica-Oblique')
          .text('This is your official ticket. Keep it safe and arrive 15-30 minutes before the event starts.', 50, yPosition, {
            width: doc.page.width - 100,
            align: 'center'
          });

        // Footer
        const footerY = doc.page.height - 40;
        doc.fillColor(textColor)
          .fontSize(8)
          .font('Helvetica')
          .text(`Generated on ${new Date().toLocaleDateString()} | Jaaiye Events`, 50, footerY, {
            width: doc.page.width - 100,
            align: 'center'
          });

        // Finalize PDF
        doc.end();
      } catch (error) {
        logger.error('Error generating PDF ticket', {
          error: error.message,
          stack: error.stack,
          ticketId: ticket._id
        });
        reject(error);
      }
    });
  }

  /**
   * Generate PDF for multiple tickets (one per page)
   * @param {Array} tickets - Array of ticket objects
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateMultipleTicketsPDF(tickets) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        for (let i = 0; i < tickets.length; i++) {
          if (i > 0) {
            doc.addPage();
          }

          const ticket = tickets[i];
          const event = ticket.eventId || {};
          const ticketId = ticket.publicId || ticket._id?.toString() || 'N/A';
          const qrCodeDataUrl = ticket.qrCode;

          const primaryColor = '#0040CC';
          const secondaryColor = '#0F172A';
          const textColor = '#64748B';

          // Header
          doc.rect(0, 0, doc.page.width, 120)
            .fillColor(primaryColor)
            .fill();

          doc.fillColor('#FFFFFF')
            .fontSize(32)
            .font('Helvetica-Bold')
            .text('JAAIYE', 50, 40, { align: 'center' });

          doc.fillColor('#FFFFFF')
            .fontSize(14)
            .font('Helvetica')
            .text(`Event Ticket ${i + 1} of ${tickets.length}`, 50, 75, { align: 'center' });

          let yPosition = 150;

          // Event Title
          doc.fillColor(secondaryColor)
            .fontSize(24)
            .font('Helvetica-Bold')
            .text(event.title || 'Event', 50, yPosition, {
              width: doc.page.width - 100,
              align: 'center'
            });

          yPosition += 40;

          // Event Details
          const detailsBoxY = yPosition;
          doc.rect(50, detailsBoxY, doc.page.width - 100, 120)
            .fillColor('#F8FAFC')
            .fill()
            .strokeColor('#E2E8F0')
            .lineWidth(1)
            .stroke();

          yPosition += 20;

          if (event.startTime) {
            const eventDate = new Date(event.startTime);
            doc.fillColor(secondaryColor)
              .fontSize(12)
              .font('Helvetica-Bold')
              .text('Date:', 70, yPosition);

            doc.fillColor(textColor)
              .fontSize(12)
              .font('Helvetica')
              .text(eventDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }), 120, yPosition);

            yPosition += 20;

            doc.fillColor(secondaryColor)
              .fontSize(12)
              .font('Helvetica-Bold')
              .text('Time:', 70, yPosition);

            doc.fillColor(textColor)
              .fontSize(12)
              .font('Helvetica')
              .text(eventDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              }), 120, yPosition);

            yPosition += 20;
          }

          if (event.venue || event.location) {
            doc.fillColor(secondaryColor)
              .fontSize(12)
              .font('Helvetica-Bold')
              .text('Venue:', 70, yPosition);

            doc.fillColor(textColor)
              .fontSize(12)
              .font('Helvetica')
              .text(event.venue || event.location, 120, yPosition);

            yPosition += 20;
          }

          if (ticket.ticketTypeName) {
            doc.fillColor(secondaryColor)
              .fontSize(12)
              .font('Helvetica-Bold')
              .text('Ticket Type:', 70, yPosition);

            doc.fillColor(textColor)
              .fontSize(12)
              .font('Helvetica')
              .text(ticket.ticketTypeName, 120, yPosition);
          }

          yPosition += 60;

          // QR Code
          if (qrCodeDataUrl) {
            const qrBoxSize = 200;
            const qrX = (doc.page.width - qrBoxSize) / 2;
            const qrY = yPosition;

            doc.rect(qrX, qrY, qrBoxSize, qrBoxSize + 40)
              .fillColor('#FFFFFF')
              .fill()
              .strokeColor('#E2E8F0')
              .lineWidth(2)
              .stroke();

            const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
            const qrBuffer = Buffer.from(base64Data, 'base64');

            doc.image(qrBuffer, qrX + 10, qrY + 10, {
              width: qrBoxSize - 20,
              height: qrBoxSize - 20,
              align: 'center'
            });

            doc.fillColor(secondaryColor)
              .fontSize(10)
              .font('Courier')
              .text(`Ticket ID: ${ticketId}`, qrX, qrY + qrBoxSize - 10, {
                width: qrBoxSize,
                align: 'center'
              });
          }

          yPosition += 200 + 60;

          doc.fillColor(textColor)
            .fontSize(10)
            .font('Helvetica')
            .text('Please present this QR code at the event entrance for check-in.', 50, yPosition, {
              width: doc.page.width - 100,
              align: 'center'
            });

          const footerY = doc.page.height - 40;
          doc.fillColor(textColor)
            .fontSize(8)
            .font('Helvetica')
            .text(`Generated on ${new Date().toLocaleDateString()} | Jaaiye Events`, 50, footerY, {
              width: doc.page.width - 100,
              align: 'center'
            });
        }

        doc.end();
      } catch (error) {
        logger.error('Error generating multiple tickets PDF', {
          error: error.message,
          stack: error.stack,
          ticketCount: tickets.length
        });
        reject(error);
      }
    });
  }
}

module.exports = new PDFService();

