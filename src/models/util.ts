import { PropertyNotArrayError, PropertyNotObjectError } from "~/models/exceptions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toObjects<OUTPUT_TYPE>(obj: any, propertyName: string, convert: (item: object) => OUTPUT_TYPE): OUTPUT_TYPE[] {
    if (isArray(obj) === false) {
        throw new PropertyNotArrayError(propertyName, obj);
    }
    if (obj.length === 0) {
        return [];
    }

    if (isObject(obj) === false) {
        throw new PropertyNotObjectError(propertyName, obj);
    }

    return obj.map((item: object) => convert(item));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isArray(obj: any): obj is any[] {
    return Array.isArray(obj)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isObject(obj: any[]): obj is object[] {
    return obj.every((item) => (typeof item === "object") && (item !== null));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDateTime(org: any, defaultDate: Date | null = null): Date {
    if (org == null) {
        return defaultDate ?? new Date();
    }

    if (org instanceof Date) {
        return org;
    }

    if (typeof org === "string") {
        return new Date(org);
    }

    return new Date();
}