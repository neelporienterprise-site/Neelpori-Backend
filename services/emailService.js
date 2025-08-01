require("dotenv").config();
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const path = require("path");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true" || false,
      auth: {
        user: process.env.SMTP_USER || process.env.SMTP_MAIL,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
      },
    });

    // Optional – check credentials at startup
    this.transporter
      .verify()
      .then(() => console.log("SMTP connection ready"))
      .catch((err) => {
        console.error("SMTP config invalid:", err);
      });
  }

  async sendOTP(email, otp, name, type = "email_verification") {
    const subjects = {
      email_verification: "Verify Your Account",
      password_reset: "Reset Your Password",
      login_verification: "Login Verification Code",
    };

    const mailOptions = {
      from: `"${process.env.APP_NAME || "Your App"}" <${
        process.env.SMTP_USER || process.env.SMTP_MAIL
      }>`,
      to: email,
      subject: subjects[type] || "Your OTP Code",
      html: "",
    };

    try {
      // Try to use EJS template first
      const templatePath = path.join(__dirname, "../templates/otpEmail.ejs");
      try {
        const html = await ejs.renderFile(templatePath, { otp, name, type });
        mailOptions.html = html;
      } catch (templateError) {
        // Fallback to inline template if EJS file doesn't exist
        const templates = {
          email_verification: `
            <h2>Welcome ${name || "User"}</h2>
            <p>Please verify your email address to complete your registration.</p>
            <h1 style="letter-spacing:5px">${otp}</h1>
            <p>This OTP will expire in 10 minutes.</p>
          `,
          password_reset: `
            <h2>Password Reset Request</h2>
            <p>Hi ${
              name || "User"
            }, you requested to reset your password. Use the OTP below:</p>
            <h1 style="letter-spacing:5px">${otp}</h1>
            <p>This OTP will expire in 10 minutes.</p>
          `,
          login_verification: `
            <h2>Login Verification</h2>
            <p>Hi ${name || "User"}, use this OTP to complete your login:</p>
            <h1 style="letter-spacing:5px">${otp}</h1>
            <p>This OTP will expire in 10 minutes.</p>
          `,
        };
        mailOptions.html = templates[type] || templates.email_verification;
      }

      await this.transporter.sendMail(mailOptions);
      console.log(`OTP email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("Error sending OTP email:", error);
      throw new Error("Failed to send OTP email");
    }
  }

  async sendPasswordResetEmail(email, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

      const mailOptions = {
        from: `"${process.env.APP_NAME || "Your App"}" <${
          process.env.SMTP_USER || process.env.SMTP_MAIL
        }>`,
        to: email,
        subject: "Password Reset Request",
        html: "",
      };

      try {
        // Try to use EJS template first
        const templatePath = path.join(
          __dirname,
          "../templates/passwordResetEmail.ejs"
        );
        const html = await ejs.renderFile(templatePath, { resetUrl });
        mailOptions.html = html;
      } catch (templateError) {
        // Fallback to inline template
        mailOptions.html = `
          <h2>Password Reset Request</h2>
          <p>You requested to reset your password. Click the link below to proceed:</p>
          <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>If you didn't request this, please ignore this email.</p>
          <p>This link will expire in 1 hour.</p>
        `;
      }

      await this.transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("Error sending password reset email:", error);
      throw new Error("Failed to send password reset email");
    }
  }

  async sendOrderConfirmation(email, order) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || "Your Store"}" <${
          process.env.SMTP_USER || process.env.SMTP_MAIL
        }>`,
        to: email,
        subject: `Order Confirmation - ${order.orderNumber || order.id}`,
        html: "",
      };

      try {
        // Try to use EJS template first
        const templatePath = path.join(
          __dirname,
          "../templates/orderConfirmation.ejs"
        );
        const html = await ejs.renderFile(templatePath, { order });
        mailOptions.html = html;
      } catch (templateError) {
        console.log("EJS template not found, using fallback template");
        // Enhanced fallback template with better styling
        mailOptions.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 10px; color: #666; font-size: 12px; }
            .total { font-weight: bold; font-size: 18px; color: #007bff; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Order Confirmation</h2>
              ${
                order.customerName
                  ? `<p>Thank you, ${order.customerName}!</p>`
                  : ""
              }
            </div>
            <div class="content">
              <p><strong>Order ID:</strong> ${order.id || "N/A"}</p>
              ${
                order.orderNumber
                  ? `<p><strong>Order Number:</strong> ${order.orderNumber}</p>`
                  : ""
              }
              <p><strong>Status:</strong> ${
                order.orderStatus || "Processing"
              }</p>
              <p><strong>Payment Status:</strong> ${
                order.paymentStatus || "Pending"
              }</p>
              
              <h3>Items Ordered:</h3>
              <ul>
                ${order.items
                  .map(
                    (item) => `
                  <li><strong>${item.productId.name}</strong> - Qty: ${
                      item.quantity
                    } - ₹${item.price} = ₹${
                      item.total || (item.price * item.quantity).toFixed(2)
                    }</li>
                `
                  )
                  .join("")}
              </ul>
              
              <p class="total">Total Amount: ₹${order.totalAmount}</p>
              
              <h3>Shipping Address:</h3>
              <p>
                ${order.address.street}<br>
                ${order.address.city}, ${order.address.state}<br>
                ${order.address.postalCode}
              </p>
            </div>
            <div class="footer">
              <p>Thank you for shopping with us!</p>
            </div>
          </div>
        </body>
        </html>
      `;
      }

      await this.transporter.sendMail(mailOptions);
      console.log(`Order confirmation email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("Error sending order confirmation email:", error);
      throw new Error("Failed to send order confirmation email");
    }
  }

  async sendOrderNotification(adminEmail, order) {
    try {
      const mailOptions = {
        from: `"${process.env.APP_NAME || "Your App"}" <${
          process.env.SMTP_USER || process.env.SMTP_MAIL
        }>`,
        to: adminEmail,
        subject: "New Order Placed",
        html: "",
      };

      try {
        // Try to use EJS template first
        const templatePath = path.join(
          __dirname,
          "../templates/orderNotification.ejs"
        );
        const html = await ejs.renderFile(templatePath, { order });
        mailOptions.html = html;
      } catch (templateError) {
        // Fallback to inline template
        mailOptions.html = `
          <h2>New Order Notification</h2>
          <p>A new order has been placed:</p>
          <p><strong>Order ID:</strong> ${order.id || "N/A"}</p>
          <p><strong>Customer:</strong> ${order.customerName || "N/A"}</p>
          <p><strong>Total:</strong> $${order.total || "0.00"}</p>
          <p>Please check the admin panel for full details.</p>
        `;
      }

      await this.transporter.sendMail(mailOptions);
      console.log(`Order notification email sent to ${adminEmail}`);
      return true;
    } catch (error) {
      console.error("Error sending order notification email:", error);
      throw new Error("Failed to send order notification email");
    }
  }

  async sendOrderCancellation(email, orderData) {
    try {
      const subject = `Order Cancelled - ${orderData.orderNumber}`;

      // HTML email template for order cancellation
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Cancelled</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #e74c3c;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #e74c3c;
            margin: 0;
            font-size: 28px;
        }
        .order-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #e74c3c;
        }
        .order-details {
            margin: 20px 0;
        }
        .item {
            border-bottom: 1px solid #eee;
            padding: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .item:last-child {
            border-bottom: none;
        }
        .item-info {
            flex: 1;
        }
        .item-name {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        .item-details {
            color: #7f8c8d;
            font-size: 14px;
        }
        .item-price {
            font-weight: bold;
            color: #2c3e50;
            font-size: 16px;
        }
        .total-section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 5px 0;
        }
        .total-row.final {
            border-top: 2px solid #e74c3c;
            font-weight: bold;
            font-size: 18px;
            color: #e74c3c;
            padding-top: 15px;
            margin-top: 15px;
        }
        .cancellation-info {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .refund-info {
            background-color: #d1ecf1;
            border: 1px solid #bee5eb;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .address-section {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #7f8c8d;
        }
        .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
        }
        .status-badge {
            background-color: #e74c3c;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Order Cancelled</h1>
            <p>Your order has been successfully cancelled</p>
        </div>

        <p>Dear ${orderData.customerName},</p>
        
        <p>We have successfully cancelled your order as requested. Here are the details:</p>

        <div class="order-info">
            <h3>Order Information</h3>
            <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date(
              orderData.createdAt
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</p>
            <p><strong>Cancellation Date:</strong> ${new Date(
              orderData.cancelledAt
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</p>
            <p><strong>Status:</strong> <span class="status-badge">Cancelled</span></p>
            <p><strong>Payment Method:</strong> ${orderData.paymentMethod.toUpperCase()}</p>
        </div>

        ${
          orderData.cancellationReason !== "No reason provided"
            ? `
        <div class="cancellation-info">
            <h3>Cancellation Reason</h3>
            <p>${orderData.cancellationReason}</p>
        </div>
        `
            : ""
        }

        <div class="order-details">
            <h3>Cancelled Items</h3>
            ${orderData.items
              .map(
                (item) => `
            <div class="item">
                <div class="item-info">
                    <div class="item-name">${item.productId.name}</div>
                    <div class="item-details">Quantity: ${item.quantity}</div>
                </div>
                <div class="item-price">₹${item.total}</div>
            </div>
            `
              )
              .join("")}
        </div>

        <div class="total-section">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>₹${orderData.subtotal}</span>
            </div>
            <div class="total-row">
                <span>Shipping:</span>
                <span>₹${orderData.shipping}</span>
            </div>
            <div class="total-row final">
                <span>Total Amount:</span>
                <span>₹${orderData.totalAmount}</span>
            </div>
        </div>

        <div class="refund-info">
            <h3>Refund Information</h3>
            <p><strong>Refund Status:</strong> ${orderData.refundStatus}</p>
            ${
              orderData.paymentMethod !== "cod" &&
              orderData.refundStatus.includes("processed")
                ? "<p>Your refund has been processed and will reflect in your account within 3-5 business days.</p>"
                : orderData.paymentMethod !== "cod"
                ? "<p>Your refund will be processed within 3-5 business days and will be credited to your original payment method.</p>"
                : "<p>Since this was a Cash on Delivery order, no payment refund is applicable.</p>"
            }
        </div>

        <div class="address-section">
            <h3>Shipping Address</h3>
            <p>
                ${orderData.address.street}<br>
                ${orderData.address.city}, ${orderData.address.state}<br>
                ${orderData.address.postalCode}
            </p>
        </div>

        <div style="text-align: center;">
            <a href="mailto:support@yourstore.com" class="button">Contact Support</a>
        </div>

        <p>If you have any questions about this cancellation or need assistance with placing a new order, please don't hesitate to contact our customer support team.</p>

        <div class="footer">
            <p>Thank you for choosing us!</p>
            <p>Best regards,<br>Your Store Team</p>
            <p style="font-size: 12px; color: #95a5a6;">
                This is an automated email. Please do not reply to this email address.
            </p>
        </div>
    </div>
</body>
</html>
`;

      // Plain text version for email clients that don't support HTML
      const textContent = `
Order Cancelled - ${orderData.orderNumber}

Dear ${orderData.customerName},

We have successfully cancelled your order as requested.

Order Information:
- Order Number: ${orderData.orderNumber}
- Order Date: ${new Date(orderData.createdAt).toLocaleDateString()}
- Cancellation Date: ${new Date(orderData.cancelledAt).toLocaleDateString()}
- Status: CANCELLED
- Payment Method: ${orderData.paymentMethod.toUpperCase()}

${
  orderData.cancellationReason !== "No reason provided"
    ? `
Cancellation Reason: ${orderData.cancellationReason}
`
    : ""
}

Cancelled Items:
${orderData.items
  .map(
    (item) =>
      `- ${item.productId.name} (Qty: ${item.quantity}) - ₹${item.total}`
  )
  .join("\n")}

Order Summary:
- Subtotal: ₹${orderData.subtotal}
- Shipping: ₹${orderData.shipping}
- Total: ₹${orderData.totalAmount}

Refund Information:
${orderData.refundStatus}

Shipping Address:
${orderData.address.street}
${orderData.address.city}, ${orderData.address.state}
${orderData.address.postalCode}

If you have any questions, please contact our support team.

Best regards,
Your Store Team
`;

      // Create mail options using the same structure as other methods
      const mailOptions = {
        from: `"${process.env.APP_NAME || "Your Store"}" <${
          process.env.SMTP_USER || process.env.SMTP_MAIL
        }>`,
        to: email,
        subject: subject,
        html: htmlContent,
        text: textContent,
      };

      // Use the existing transporter to send the email
      await this.transporter.sendMail(mailOptions);
      console.log(`Order cancellation email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("Error in sendOrderCancellation:", error);
      throw new Error("Failed to send order cancellation email");
    }
  }
  
  async sendOrderStatusUpdate(email, orderData) {
    try {
      const getStatusMessage = (status) => {
        const messages = {
          pending: "Your order has been received and is being processed.",
          processing: "Your order is currently being prepared for shipment.",
          shipped:
            "Great news! Your order has been shipped and is on its way to you.",
          delivered:
            "Your order has been successfully delivered. Thank you for shopping with us!",
          cancelled: "Your order has been cancelled as requested.",
        };
        return messages[status] || "Your order status has been updated.";
      };

      const getShippingMessage = (status) => {
        const messages = {
          processing: "Your order is being prepared for shipment.",
          shipped: "Your package has left our warehouse and is in transit.",
          in_transit: "Your package is currently in transit to your location.",
          out_for_delivery:
            "Your package is out for delivery and will arrive soon!",
          delivered: "Your package has been delivered successfully.",
          returned: "Your package has been returned to our warehouse.",
          failed:
            "There was an issue with the delivery. Our team will contact you shortly.",
        };
        return messages[status] || "Shipping status updated.";
      };

      const subject = `Order Update - ${orderData.orderNumber}`;

      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Status Update</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #007bff;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #007bff;
            margin: 0;
            font-size: 28px;
        }
        .status-update {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 25px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 14px;
            margin: 10px;
        }
        .status-pending { background-color: #ffc107; color: #212529; }
        .status-processing { background-color: #17a2b8; color: white; }
        .status-shipped { background-color: #007bff; color: white; }
        .status-delivered { background-color: #28a745; color: white; }
        .status-cancelled { background-color: #dc3545; color: white; }
        .order-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #007bff;
        }
        .tracking-info {
            background-color: #e3f2fd;
            border: 1px solid #bbdefb;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .order-details {
            margin: 20px 0;
        }
        .item {
            border-bottom: 1px solid #eee;
            padding: 15px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .item:last-child {
            border-bottom: none;
        }
        .item-info {
            flex: 1;
        }
        .item-name {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        .item-details {
            color: #7f8c8d;
            font-size: 14px;
        }
        .item-price {
            font-weight: bold;
            color: #2c3e50;
            font-size: 16px;
        }
        .total-section {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 5px 0;
        }
        .total-row.final {
            border-top: 2px solid #007bff;
            font-weight: bold;
            font-size: 18px;
            color: #007bff;
            padding-top: 15px;
            margin-top: 15px;
        }
        .timeline {
            margin: 20px 0;
        }
        .timeline-item {
            display: flex;
            align-items: center;
            margin: 15px 0;
            padding: 10px;
            border-radius: 5px;
        }
        .timeline-item.active {
            background-color: #e8f5e8;
            border-left: 4px solid #28a745;
        }
        .timeline-item.current {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
        }
        .timeline-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 15px;
            background-color: #dee2e6;
        }
        .timeline-dot.active {
            background-color: #28a745;
        }
        .timeline-dot.current {
            background-color: #ffc107;
        }
        .address-section {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #7f8c8d;
        }
        .button {
            display: inline-block;
            padding: 12px 30px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Order Status Update</h1>
            <p>Your order has been updated</p>
        </div>

        <div class="status-update">
            <h2>Hi ${orderData.customerName}!</h2>
            <p>${getStatusMessage(orderData.orderStatus)}</p>
            <div>
                <span class="status-badge status-${
                  orderData.orderStatus
                }">${orderData.orderStatus.replace("_", " ")}</span>
                ${
                  orderData.shippingStatus
                    ? `<span class="status-badge status-${
                        orderData.shippingStatus
                      }">${orderData.shippingStatus.replace("_", " ")}</span>`
                    : ""
                }
            </div>
        </div>

        <div class="order-info">
            <h3>Order Information</h3>
            <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
            <p><strong>Order Date:</strong> ${new Date(
              orderData.createdAt
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}</p>
            <p><strong>Order Status:</strong> ${orderData.orderStatus.toUpperCase()}</p>
            <p><strong>Payment Status:</strong> ${orderData.paymentStatus.toUpperCase()}</p>
            <p><strong>Shipping Status:</strong> ${orderData.shippingStatus.toUpperCase()}</p>
        </div>

        ${
          orderData.trackingId || orderData.awbNumber || orderData.courierName
            ? `
        <div class="tracking-info">
            <h3>📦 Shipping & Tracking Information</h3>
            ${
              orderData.trackingId
                ? `<p><strong>Tracking ID:</strong> ${orderData.trackingId}</p>`
                : ""
            }
            ${
              orderData.awbNumber
                ? `<p><strong>AWB Number:</strong> ${orderData.awbNumber}</p>`
                : ""
            }
            ${
              orderData.courierName
                ? `<p><strong>Courier:</strong> ${orderData.courierName}</p>`
                : ""
            }
            ${
              orderData.estimatedDelivery
                ? `<p><strong>Expected Delivery:</strong> ${new Date(
                    orderData.estimatedDelivery
                  ).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}</p>`
                : ""
            }
            <p><em>${getShippingMessage(orderData.shippingStatus)}</em></p>
        </div>
        `
            : ""
        }

        <div class="timeline">
            <h3>Order Progress</h3>
            <div class="timeline-item ${
              ["pending", "processing", "shipped", "delivered"].includes(
                orderData.orderStatus
              )
                ? "active"
                : ""
            }">
                <div class="timeline-dot ${
                  ["pending", "processing", "shipped", "delivered"].includes(
                    orderData.orderStatus
                  )
                    ? "active"
                    : ""
                }"></div>
                <div>Order Placed</div>
            </div>
            <div class="timeline-item ${
              ["processing", "shipped", "delivered"].includes(
                orderData.orderStatus
              )
                ? "active"
                : orderData.orderStatus === "processing"
                ? "current"
                : ""
            }">
                <div class="timeline-dot ${
                  ["processing", "shipped", "delivered"].includes(
                    orderData.orderStatus
                  )
                    ? "active"
                    : orderData.orderStatus === "processing"
                    ? "current"
                    : ""
                }"></div>
                <div>Processing</div>
            </div>
            <div class="timeline-item ${
              ["shipped", "delivered"].includes(orderData.orderStatus)
                ? "active"
                : orderData.orderStatus === "shipped"
                ? "current"
                : ""
            }">
                <div class="timeline-dot ${
                  ["shipped", "delivered"].includes(orderData.orderStatus)
                    ? "active"
                    : orderData.orderStatus === "shipped"
                    ? "current"
                    : ""
                }"></div>
                <div>Shipped</div>
            </div>
            <div class="timeline-item ${
              orderData.orderStatus === "delivered" ? "active" : ""
            }">
                <div class="timeline-dot ${
                  orderData.orderStatus === "delivered" ? "active" : ""
                }"></div>
                <div>Delivered</div>
            </div>
        </div>

        <div class="order-details">
            <h3>Order Items</h3>
            ${orderData.items
              .map(
                (item) => `
            <div class="item">
                <div class="item-info">
                    <div class="item-name">${item.productId.name}</div>
                    <div class="item-details">Quantity: ${item.quantity}</div>
                </div>
                <div class="item-price">₹${item.total}</div>
            </div>
            `
              )
              .join("")}
        </div>

        <div class="total-section">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>₹${orderData.subtotal}</span>
            </div>
            <div class="total-row">
                <span>Shipping:</span>
                <span>₹${orderData.shipping}</span>
            </div>
            <div class="total-row final">
                <span>Total Amount:</span>
                <span>₹${orderData.totalAmount}</span>
            </div>
        </div>

        <div class="address-section">
            <h3>Shipping Address</h3>
            <p>
                ${orderData.address.street}<br>
                ${orderData.address.city}, ${orderData.address.state}<br>
                ${orderData.address.postalCode}
            </p>
        </div>

        ${
          orderData.statusUpdate.adminNotes
            ? `
        <div class="order-info">
            <h3>Additional Notes</h3>
            <p>${orderData.statusUpdate.adminNotes}</p>
        </div>
        `
            : ""
        }

        <div style="text-align: center;">
            <a href="mailto:support@yourstore.com" class="button">Contact Support</a>
        </div>

        <p>Thank you for choosing us! If you have any questions about your order, please don't hesitate to contact our customer support team.</p>

        <div class="footer">
            <p>Best regards,<br>Your Store Team</p>
            <p style="font-size: 12px; color: #95a5a6;">
                This is an automated email. Please do not reply to this email address.
            </p>
        </div>
    </div>
</body>
</html>
`;

      const textContent = `
Order Status Update - ${orderData.orderNumber}

Hi ${orderData.customerName},

${getStatusMessage(orderData.orderStatus)}

Order Information:
- Order Number: ${orderData.orderNumber}
- Order Date: ${new Date(orderData.createdAt).toLocaleDateString()}
- Order Status: ${orderData.orderStatus.toUpperCase()}
- Payment Status: ${orderData.paymentStatus.toUpperCase()}
- Shipping Status: ${orderData.shippingStatus.toUpperCase()}

${orderData.trackingId ? `Tracking ID: ${orderData.trackingId}` : ""}
${orderData.awbNumber ? `AWB Number: ${orderData.awbNumber}` : ""}
${orderData.courierName ? `Courier: ${orderData.courierName}` : ""}
${
  orderData.estimatedDelivery
    ? `Expected Delivery: ${new Date(
        orderData.estimatedDelivery
      ).toLocaleDateString()}`
    : ""
}

Order Items:
${orderData.items
  .map(
    (item) =>
      `- ${item.productId.name} (Qty: ${item.quantity}) - ₹${item.total}`
  )
  .join("\n")}

Order Summary:
- Subtotal: ₹${orderData.subtotal}
- Shipping: ₹${orderData.shipping}
- Total: ₹${orderData.totalAmount}

Shipping Address:
${orderData.address.street}
${orderData.address.city}, ${orderData.address.state}
${orderData.address.postalCode}

${
  orderData.statusUpdate.adminNotes
    ? `Additional Notes: ${orderData.statusUpdate.adminNotes}`
    : ""
}

Thank you for choosing us!

Best regards,
Your Store Team
`;

      const mailOptions = {
        from: `"${process.env.APP_NAME || "Your Store"}" <${
          process.env.SMTP_USER || process.env.SMTP_MAIL
        }>`,
        to: email,
        subject: subject,
        html: htmlContent,
        text: textContent,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`Order status update email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("Error in sendOrderStatusUpdate:", error);
      throw new Error("Failed to send order status update email");
    }
  }
}

module.exports = new EmailService();
