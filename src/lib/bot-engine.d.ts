export interface BotSession {
  [key: string]: unknown;
}

export interface BotParsedMessage {
  phone: string;
  text: string;
  message_id: string;
  phone_number_id: string;
}

export interface BotResult {
  step: string;
  text_response?: string;
  pre_text?: string;
  pre_payload?: unknown;
  has_pre_text?: boolean;
  has_inv_img?: boolean;
  inv_img_url?: string | null;
  inv_img_caption?: string;
  wa_payload?: unknown;
  followup_payload?: unknown;
  has_followup?: boolean;
  extra_payloads?: unknown[];
  has_extra?: boolean;
  quote_images?: string[];
  has_quote_images?: boolean;
  send_quote_file?: boolean;
  send_study_file?: boolean;
  make_sld?: boolean;
  quote_number?: string;
  quote_caption?: string;
  quote_file_url?: string;
  quote_file_name?: string;
  [key: string]: unknown;
}

export function runBot(
  session: BotSession,
  parsed: BotParsedMessage,
  itemPrices?: Record<string, number>,
): BotResult | null;
