/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MAX_BYTES, sourceProblem } from "./markdown";

export const MAX_CSV_ROWS = 1000;
export const MAX_CSV_COLUMNS = 100;
export const MAX_CSV_CELLS = 6000;
export const MAX_CSV_FIELD_LENGTH = 16 * 1024;

export type CsvResult = { rows: string[][]; columns: number; error?: undefined; } | { rows?: undefined; columns?: undefined; error: string; };

export function isCsvFilename(filename: unknown): filename is string {
    return typeof filename === "string" && /\.csv$/i.test(filename);
}

export function parseCsv(source: string, bytesLeft = 0): CsvResult {
    // A CSV record may occupy one long line; fields have a separate finite limit.
    const problem = sourceProblem(source, bytesLeft, MAX_BYTES, MAX_BYTES);
    if (problem) return { error: problem };
    const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
    if (text.length === 0) return { rows: [], columns: 0 };

    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    let closedQuote = false;
    let endedRecord = false;
    let cells = 0;
    let columns = 0;
    const limitError = "This CSV exceeds the preview row, column, cell or field limits. Use Raw or download the original.";
    const malformedError = "This CSV has invalid quoting. Use Raw or download the original.";

    const finishField = () => {
        if (row.length >= MAX_CSV_COLUMNS || ++cells > MAX_CSV_CELLS) return false;
        row.push(field);
        field = "";
        closedQuote = false;
        return true;
    };
    const finishRecord = () => {
        if (rows.length >= MAX_CSV_ROWS) return false;
        columns = Math.max(columns, row.length);
        rows.push(row);
        row = [];
        // Padding ragged records must not multiply a small source into a huge table.
        return rows.length * columns <= MAX_CSV_CELLS;
    };

    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (char === "\"") {
                if (text[index + 1] === "\"") {
                    field += "\"";
                    index++;
                } else {
                    quoted = false;
                    closedQuote = true;
                }
            } else field += char;
        } else if (char === "\"") {
            if (field.length || closedQuote) return { error: malformedError };
            quoted = true;
            endedRecord = false;
        } else if (char === ",") {
            if (!finishField()) return { error: limitError };
            endedRecord = false;
        } else if (char === "\r" || char === "\n") {
            if (!finishField() || !finishRecord()) return { error: limitError };
            if (char === "\r" && text[index + 1] === "\n") index++;
            endedRecord = true;
        } else {
            if (closedQuote) return { error: malformedError };
            field += char;
            endedRecord = false;
        }
        if (field.length > MAX_CSV_FIELD_LENGTH) return { error: limitError };
    }
    if (quoted) return { error: malformedError };
    if (!endedRecord && (!finishField() || !finishRecord())) return { error: limitError };
    return { rows: rows.map(record => [...record, ...Array<string>(columns - record.length).fill("")]), columns };
}
