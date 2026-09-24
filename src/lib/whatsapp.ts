/** Click-to-chat link that opens WhatsApp with `text` ready to send to `phone` (E.164). */
export function whatsAppChatUrl(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
