import { func } from './func';
/**
 * @hidden
 */
export declare namespace assert {
    /**
     * Tests value to see if it is truthy. If it is not, an exception will be thrown containing the message generated by calling the message function provided.
     * @param value The value to test.
     * @param message A callback to create a message that will be the message of an Error exception.
     */
    function ok(value: any, message: func.Producer<string>): void;
}
