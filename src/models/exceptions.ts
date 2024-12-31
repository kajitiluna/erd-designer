
export abstract class FailureToDecodeObjectError extends Error {

    constructor(message: string) {
        super(message);
    }
}

/**
 * デコード対象のオブジェクトに想定したフィールドが存在しない場合に発生するエラー。
 * 
 */
export class PropertyNotExistsError extends FailureToDecodeObjectError {

    public readonly propertyName: string;

    constructor(propertyName: string, obj: object) {
        super(`Not exists property '${propertyName}' in object : ${obj}`);
        this.propertyName = propertyName;
    }
}

/**
 * デコード対象が配列でなかった場合に発生するエラー。
 */
export class PropertyNotArrayError extends FailureToDecodeObjectError {

    public readonly propertyName: string;

    constructor(propertyName: string, obj: object) {
        super(`The property '${propertyName}' is not array : ${obj}`);
        this.propertyName = propertyName;
    }
}

/**
 * デコード対象がオブジェクトでなかった場合に発生するエラー。。
 */
export class PropertyNotObjectError extends FailureToDecodeObjectError {

    public readonly propertyName: string;

    constructor(propertyName: string, obj: object) {
        super(`The property '${propertyName}' is not Object : ${obj}`);
        this.propertyName = propertyName;
    }
}