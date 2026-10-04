import assert from "node:assert/strict";
import { test } from "node:test";

import { isCsvFilename, MAX_CSV_CELLS, MAX_CSV_COLUMNS, MAX_CSV_FIELD_LENGTH, MAX_CSV_ROWS, parseCsv } from "../plugin/filePreview/csv";
import { attachmentPreviewRange } from "../plugin/filePreview/html";
import { MAX_BYTES } from "../plugin/filePreview/markdown";

test("CSV filenames and bounded range only qualify exact Discord attachment URLs", () => {
    for (const name of ["a.csv", "A.CSV", "SPOILER_a.Csv"]) {
        assert.ok(isCsvFilename(name));
        for (const host of ["cdn.discordapp.com", "media.discordapp.net"])
            assert.equal(attachmentPreviewRange(`https://${host}/attachments/1/2/${name}?signature=sample`), `bytes=0-${MAX_BYTES}`);
    }
    for (const name of ["csv", "a.csv.exe", "a.csv?query", undefined, {}]) assert.ok(!isCsvFilename(name));
    for (const url of ["https://evil.invalid/attachments/1/2/a.csv", "https://cdn.discordapp.com.evil.invalid/attachments/1/2/a.csv", "http://cdn.discordapp.com/attachments/1/2/a.csv", "https://cdn.discordapp.com/elsewhere/a.csv"])
        assert.equal(attachmentPreviewRange(url), "bytes=0-50000");
});

test("quoted commas, escaped quotes, empty fields and whitespace are preserved", () => {
    assert.deepEqual(parseCsv('name,notes,empty\r\n"Alpha, Inc.","He said ""hello""",\r\n  spaced  ,"",last').rows, [
        ["name", "notes", "empty"], ["Alpha, Inc.", 'He said "hello"', ""], ["  spaced  ", "", "last"]
    ]);
});

test("embedded CRLF/LF/CR inside quotes are kept inside one field", () => {
    assert.deepEqual(parseCsv('a,"first\r\nsecond\nthird\rfourth",z\r\nb,c,d').rows, [["a", "first\r\nsecond\nthird\rfourth", "z"], ["b", "c", "d"]]);
});

test("BOM and each record ending work without creating a phantom final row", () => {
    for (const ending of ["\r\n", "\n", "\r"])
        assert.deepEqual(parseCsv(`\ufeffa,b${ending}c,d${ending}`).rows, [["a", "b"], ["c", "d"]]);
    assert.deepEqual(parseCsv("a\ufeff,b").rows, [["a\ufeff", "b"]]);
});

test("empty documents, blank records and leading/trailing empty cells remain distinct", () => {
    for (const source of ["", "\ufeff"]) assert.deepEqual(parseCsv(source), { rows: [], columns: 0 });
    assert.deepEqual(parseCsv('\n""\n,\n,tail,').rows, [["", "", ""], ["", "", ""], ["", "", ""], ["", "tail", ""]]);
    assert.deepEqual(parseCsv("a,").rows, [["a", ""]]);
});

test("ragged records retain their data and pad only missing cells", () => {
    assert.deepEqual(parseCsv("a\nb,c,d\ne,f").rows, [["a", "", ""], ["b", "c", "d"], ["e", "f", ""]]);
});

test("invalid quoting fails closed", () => {
    for (const source of ['"unclosed', 'unquoted"quote', '"closed"tail', '"closed" "more"', '"""']) assert.ok(parseCsv(source).error, source);
});

test("partial, unknown, oversize and non-UTF8-byte-safe CSV cannot preview", () => {
    for (const bytes of [1, NaN, Infinity, -1]) assert.ok(parseCsv("a,b", bytes).error);
    assert.ok(parseCsv("a".repeat(MAX_BYTES + 1)).error);
    assert.ok(parseCsv("😀".repeat(MAX_BYTES / 3)).error);
});

test("the complete bounded CSV fetch supports documents above 50 KB up to the byte limit", () => {
    const source = Array.from({ length: 25 }, () => Array(4).fill("x".repeat(1000)).join(",")).join("\n");
    assert.ok(Buffer.byteLength(source) > 50000);
    assert.equal(parseCsv(source).rows?.length, 25);
    const atLimit = Array(15).fill("x".repeat(MAX_CSV_FIELD_LENGTH)).join("\n") + "\n" + "x".repeat(MAX_CSV_FIELD_LENGTH - 15);
    assert.equal(Buffer.byteLength(atLimit), MAX_BYTES);
    assert.equal(parseCsv(atLimit).rows?.length, 16);
    assert.ok(parseCsv(atLimit + "x").error);
});

test("row and column boundaries are enforced", () => {
    assert.equal(parseCsv(Array(MAX_CSV_ROWS).fill("a").join("\n")).rows?.length, MAX_CSV_ROWS);
    assert.ok(parseCsv(Array(MAX_CSV_ROWS + 1).fill("a").join("\n")).error);
    assert.equal(parseCsv(Array(MAX_CSV_COLUMNS).fill("a").join(",")).columns, MAX_CSV_COLUMNS);
    assert.ok(parseCsv(Array(MAX_CSV_COLUMNS + 1).fill("a").join(",")).error);
});

test("field, total cell and ragged-padding budgets are enforced", () => {
    assert.ok(parseCsv("x".repeat(MAX_CSV_FIELD_LENGTH)).rows);
    assert.ok(parseCsv("x".repeat(MAX_CSV_FIELD_LENGTH + 1)).error);
    const row = Array(MAX_CSV_COLUMNS).fill("a").join(",");
    assert.equal(parseCsv(Array(MAX_CSV_CELLS / MAX_CSV_COLUMNS).fill(row).join("\n")).rows?.length, 60);
    assert.ok(parseCsv(Array(61).fill(row).join("\n")).error);
    assert.ok(parseCsv(Array(61).fill("a").join("\n") + "\n" + row).error);
});

test("hostile markup, web addresses and spreadsheet formulas are only literal strings", () => {
    const fields = ['<script>window.evil=true</script>', '<img src="https://tracking.invalid/pixel">', "javascript:alert(1)", "=SUM(1,2)", "https://tracking.invalid", "&lt;b&gt;"];
    const encoded = fields.map(value => '"' + value.replaceAll('"', '""') + '"').join(",");
    assert.deepEqual(parseCsv(encoded).rows, [fields]);
});

test("deterministic round trips preserve mixed Unicode, quotes, separators and line endings", () => {
    const values = ["", "plain", " a ", "a,b", 'a"b', "one\ntwo", "one\r\ntwo", "😀", "東京", "<b>literal</b>"];
    for (let iteration = 0; iteration < 50; iteration++) {
        const rows = Array.from({ length: 1 + iteration % 10 }, (_, row) => Array.from({ length: 1 + iteration % 8 }, (_, col) => values[(iteration + row * 7 + col * 3) % values.length]));
        const encoded = rows.map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(",")).join(iteration % 2 ? "\r\n" : "\n");
        assert.deepEqual(parseCsv(encoded).rows, rows);
    }
});

test("bounded adversarial CSV is rejected promptly", () => {
    const start = performance.now();
    for (const source of [",".repeat(250000), '"'.repeat(250000), "a\n".repeat(120000), '"' + "\n".repeat(9000) + '"']) parseCsv(source);
    assert.ok(performance.now() - start < 1500);
});
