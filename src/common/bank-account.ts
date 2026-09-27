import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { toLatinDigits } from './national-id';

export function normalizeAccountNumber(input: string) {
  return toLatinDigits(input).replace(/\D/g, '');
}

export function normalizeCardNumber(input: string) {
  return toLatinDigits(input).replace(/\D/g, '');
}

export function normalizeIban(input: string) {
  let value = toLatinDigits(input)
    .replace(/[\s-]/g, '')
    .toUpperCase();
  if (/^\d{24}$/.test(value)) {
    value = `IR${value}`;
  }
  return value;
}

export function isValidAccountNumber(input: string) {
  return /^\d{6,20}$/.test(normalizeAccountNumber(input));
}

export function isValidIranianCardNumber(input: string) {
  const digits = normalizeCardNumber(input);
  if (!/^\d{16}$/.test(digits) || /^(\d)\1{15}$/.test(digits)) {
    return false;
  }
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let n = Number(digits[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function isValidIranianIban(input: string) {
  const iban = normalizeIban(input);
  if (!/^IR\d{24}$/.test(iban)) {
    return false;
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder === 1;
}

@ValidatorConstraint({ name: 'isIranianCardNumber', async: false })
class IsIranianCardNumberConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIranianCardNumber(value);
  }

  defaultMessage() {
    return 'شماره کارت معتبر نیست';
  }
}

export function IsIranianCardNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIranianCardNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsIranianCardNumberConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isIranianIban', async: false })
class IsIranianIbanConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIranianIban(value);
  }

  defaultMessage() {
    return 'شماره شبا معتبر نیست';
  }
}

export function IsIranianIban(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIranianIban',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsIranianIbanConstraint,
    });
  };
}
