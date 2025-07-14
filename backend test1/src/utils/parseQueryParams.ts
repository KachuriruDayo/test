import { parsePhoneNumberFromString } from "libphonenumber-js";
import BadRequestError from "../errors/bad-request-error";

interface OrderQueryParams {
    page?: string | string[];
    limit?: string | string[];
    sortField?: string | string[];
    sortOrder?: string | string[];
    status?: string | string[];
    totalAmountFrom?: string | string[];
    totalAmountTo?: string | string[];
    orderDateFrom?: string | string[];
    orderDateTo?: string | string[];
    search?: string | string[];
}

interface NormalizedOrderParams {
    page: number;
    limit: number;
    sortField: string;
    sortOrder: "asc" | "desc";
    status?: string;
    totalAmountFrom?: number;
    totalAmountTo?: number;
    orderDateFrom?: Date;
    orderDateTo?: Date;
    search?: string;
}

interface CustomerQueryParams {
    page?: string | string[];
    limit?: string | string[];
    sortField?: string | string[];
    sortOrder?: string | string[];
    registrationDateFrom?: string | string[];
    registrationDateTo?: string | string[];
    lastOrderDateFrom?: string | string[];
    lastOrderDateTo?: string | string[];
    totalAmountFrom?: string | string[];
    totalAmountTo?: string | string[];
    orderCountFrom?: string | string[];
    orderCountTo?: string | string[];
    search?: string | string[];
}

interface NormalizedCustomerParams {
    page: number;
    limit: number;
    sortField: string;
    sortOrder: "asc" | "desc";
    registrationDateFrom?: Date;
    registrationDateTo?: Date;
    lastOrderDateFrom?: Date;
    lastOrderDateTo?: Date;
    totalAmountFrom?: number;
    totalAmountTo?: number;
    orderCountFrom?: number;
    orderCountTo?: number;
    search?: string;
}

// Хелпер для получения одного значения из string или string[]
const getSingleString = (value?: string | string[]): string | undefined => {
    if (Array.isArray(value)) {
        if (value.length === 0) return undefined;
        if (value.length > 1) throw new BadRequestError("Параметр не должен быть массивом");
        return value[0];
    }
    return value;
};

// Универсальные парсеры
const parsePositiveInt = (value?: string, defaultValue?: number): number | undefined => {
    if (!value) return defaultValue;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new BadRequestError(`Параметр должен быть положительным целым числом: ${value}`);
    return n;
};

const parseNonNegativeNumber = (value?: string): number | undefined => {
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new BadRequestError(`Параметр должен быть неотрицательным числом: ${value}`);
    return n;
};

const parseDate = (value?: string): Date | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestError(`Параметр должен быть валидной датой: ${value}`);
    return d;
};

const parseSortOrder = (value?: string, defaultValue: "asc" | "desc" = "desc"): "asc" | "desc" => {
    if (!value) return defaultValue;
    if (value !== "asc" && value !== "desc") throw new BadRequestError('sortOrder должен быть "asc" или "desc"');
    return value;
};

const sanitizeSearch = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  const allowed = /^[a-zA-Z0-9\s\-_.+%]+$/;
  if (!allowed.test(trimmed)) {
    throw new BadRequestError('Поисковый запрос содержит недопустимые символы');
  }

  return trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};


export const normalizeLimit = (limitQuery: unknown, defaultLim: number): number => {
    let limitStr = "";
    if (typeof limitQuery === "string") {
        limitStr = limitQuery;
    } else if (Array.isArray(limitQuery)) {
        limitStr = limitQuery[0] ?? "";
    }
    const limitNum = parseInt(limitStr, 10);
    if (Number.isNaN(limitNum) || limitNum <= 0) return defaultLim;
    return Math.min(limitNum, defaultLim);
};

export const normalizePhone = (input: unknown, defaultCountry = "RU" as any): string | null => {
    if (typeof input !== "string") return null;
    const cleanedInput = input.replace(/[^\d+]/g, "");
    const phoneNumber = parsePhoneNumberFromString(cleanedInput, defaultCountry);
    if (!phoneNumber || !phoneNumber.isValid()) return null;
    return phoneNumber.number;
};

export const normalizeOrderQueryParams = (query: OrderQueryParams, defaultLimit = 10): NormalizedOrderParams => ({
        page: parsePositiveInt(getSingleString(query.page), 1)!,
        limit: normalizeLimit(getSingleString(query.limit), defaultLimit),
        sortField: getSingleString(query.sortField) ?? "createdAt",
        sortOrder: parseSortOrder(getSingleString(query.sortOrder)),
        status: getSingleString(query.status),
        totalAmountFrom: parseNonNegativeNumber(getSingleString(query.totalAmountFrom)),
        totalAmountTo: parseNonNegativeNumber(getSingleString(query.totalAmountTo)),
        orderDateFrom: parseDate(getSingleString(query.orderDateFrom)),
        orderDateTo: parseDate(getSingleString(query.orderDateTo)),
        search: sanitizeSearch(getSingleString(query.search)),
    });

export const normalizeCustomerQueryParams = (
    query: CustomerQueryParams,
    defaultLimit = 10
): NormalizedCustomerParams => ({
        page: parsePositiveInt(getSingleString(query.page), 1)!,
        limit: normalizeLimit(getSingleString(query.limit), defaultLimit),
        sortField: getSingleString(query.sortField) ?? "createdAt",
        sortOrder: parseSortOrder(getSingleString(query.sortOrder), "desc"),

        registrationDateFrom: parseDate(getSingleString(query.registrationDateFrom)),
        registrationDateTo: parseDate(getSingleString(query.registrationDateTo)),
        lastOrderDateFrom: parseDate(getSingleString(query.lastOrderDateFrom)),
        lastOrderDateTo: parseDate(getSingleString(query.lastOrderDateTo)),

        totalAmountFrom: parseNonNegativeNumber(getSingleString(query.totalAmountFrom)),
        totalAmountTo: parseNonNegativeNumber(getSingleString(query.totalAmountTo)),

        orderCountFrom: parseNonNegativeNumber(getSingleString(query.orderCountFrom)),
        orderCountTo: parseNonNegativeNumber(getSingleString(query.orderCountTo)),

        search: sanitizeSearch(getSingleString(query.search)),
    });
