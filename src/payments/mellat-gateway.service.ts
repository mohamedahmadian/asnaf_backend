import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_SERVICE_URL = 'https://bpm.shaparak.ir/pgwchannel/services/pgw';
const DEFAULT_START_PAY_URL = 'https://bpm.shaparak.ir/pgwchannel/startpay.mellat';
const SOAP_NAMESPACE = 'http://interfaces.core.sw.bps.com/';
const REQUEST_TIMEOUT_MS = 20_000;

/** کد ۴۳ یعنی قبلاً verify شده و ۴۵ یعنی قبلاً settle شده؛ هر دو موفق حساب می‌شوند. */
const ALREADY_VERIFIED = '43';
const ALREADY_SETTLED = '45';

type FollowUpInput = {
  orderId: bigint;
  saleOrderId: string;
  saleReferenceId: string;
};

export type MellatPayResult = {
  ok: boolean;
  refId: string | null;
  resCode: string;
  raw: string;
};

@Injectable()
export class MellatGatewayService {
  private readonly logger = new Logger(MellatGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  get startPayUrl() {
    return this.config.get<string>('MELLAT_START_PAY_URL')?.trim() || DEFAULT_START_PAY_URL;
  }

  private get serviceUrl() {
    return this.config.get<string>('MELLAT_SERVICE_URL')?.trim() || DEFAULT_SERVICE_URL;
  }

  private credentials() {
    const terminalId = this.config.get<string>('MELLAT_TERMINAL_ID')?.trim();
    const userName = this.config.get<string>('MELLAT_USERNAME')?.trim();
    const userPassword = this.config.get<string>('MELLAT_PASSWORD')?.trim();
    if (!terminalId || !userName || !userPassword) {
      throw new ServiceUnavailableException('درگاه به‌پرداخت ملت تنظیم نشده است');
    }
    return { terminalId, userName, userPassword };
  }

  async payRequest(input: {
    orderId: bigint;
    amount: number;
    callBackUrl: string;
    additionalData?: string;
  }): Promise<MellatPayResult> {
    const now = tehranClock();
    const raw = await this.call('bpPayRequest', {
      ...this.credentials(),
      orderId: input.orderId.toString(),
      amount: String(input.amount),
      localDate: now.date,
      localTime: now.time,
      additionalData: input.additionalData ?? '',
      callBackUrl: input.callBackUrl,
      payerId: '0',
    });
    const [resCode, refId] = raw.split(',').map((part) => part.trim());
    if (resCode === '0' && refId) {
      return { ok: true, refId, resCode, raw };
    }
    return { ok: false, refId: null, resCode: resCode || raw, raw };
  }

  async verify(input: FollowUpInput) {
    const code = await this.followUp('bpVerifyRequest', input);
    return { ok: code === '0' || code === ALREADY_VERIFIED, code };
  }

  async settle(input: FollowUpInput) {
    const code = await this.followUp('bpSettleRequest', input);
    return { ok: code === '0' || code === ALREADY_SETTLED, code };
  }

  async inquiry(input: FollowUpInput) {
    const code = await this.followUp('bpInquiryRequest', input);
    return { ok: code === '0', code };
  }

  async reversal(input: FollowUpInput) {
    const code = await this.followUp('bpReversalRequest', input);
    return { ok: code === '0', code };
  }

  private async followUp(method: string, input: FollowUpInput) {
    const raw = await this.call(method, {
      ...this.credentials(),
      orderId: input.orderId.toString(),
      saleOrderId: input.saleOrderId,
      saleReferenceId: input.saleReferenceId,
    });
    return raw.trim();
  }

  private async call(method: string, params: Record<string, string>) {
    const body = Object.entries(params)
      .map(([key, value]) => `<${key}>${escapeXml(value)}</${key}>`)
      .join('');
    const envelope =
      '<?xml version="1.0" encoding="utf-8"?>' +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="${SOAP_NAMESPACE}">` +
      `<soapenv:Body><ns1:${method}>${body}</ns1:${method}></soapenv:Body></soapenv:Envelope>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(this.serviceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
        body: envelope,
        signal: controller.signal,
      });
      const text = await response.text();
      const match = /<return>([\s\S]*?)<\/return>/.exec(text);
      if (!match) {
        this.logger.error(`Mellat ${method} unexpected response (${response.status})`);
        throw new ServiceUnavailableException('پاسخ نامعتبر از درگاه بانک');
      }
      return match[1];
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Mellat ${method} failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('ارتباط با درگاه بانک برقرار نشد');
    } finally {
      clearTimeout(timer);
    }
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tehranClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: `${get('year')}${get('month')}${get('day')}`,
    time: `${hour}${get('minute')}${get('second')}`,
  };
}
