export interface SendOtpPayload {
  toEmail: string;
  empName?: string;
  otpCode: string;
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  warning?: string;
  error?: string;
}

/**
 * Dispatches an OTP verification email using the Nodemailer API endpoint
 */
export async function sendOtpEmail(payload: SendOtpPayload): Promise<SendOtpResult> {
  try {
    const response = await fetch('/api/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP error! status: ${response.status}`,
      };
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.warn('Network call to /api/send-otp failed (local preview or offline):', error);
    return {
      success: true,
      warning: 'Local fallback active. OTP generated on-screen.',
    };
  }
}
