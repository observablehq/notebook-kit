/* eslint-disable @typescript-eslint/no-explicit-any */

export type TemplateRenderer<T = Node> = (template: readonly string[], ...values: any[]) => T;
export type RawTemplateRenderer<T = Node> = (template: {raw: readonly string[]}, ...values: any[]) => T;
export type AsyncRawTemplateRenderer<T = Node> = (template: {raw: readonly string[]}, ...values: any[]) => Promise<T>;
