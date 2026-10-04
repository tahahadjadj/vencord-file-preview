// Synthetic CSV only: no account, chat, attachment or local report data.
export const csvSample = '\ufeff"name","notes","value","empty"\r\n"Alpha, Inc.","first\r\nsecond","He said ""hello""",\r\n"=SUM(1,2)","<script>window.csvExecuted=true</script>","https://tracking.invalid/not-a-link",\r\n"<img src=""https://tracking.invalid/pixel"" onerror=""window.csvExecuted=true"">","end",,\r\n';
export const csvRows = [
    ["name", "notes", "value", "empty"],
    ["Alpha, Inc.", "first\r\nsecond", 'He said "hello"', ""],
    ["=SUM(1,2)", "<script>window.csvExecuted=true</script>", "https://tracking.invalid/not-a-link", ""],
    ['<img src="https://tracking.invalid/pixel" onerror="window.csvExecuted=true">', "end", "", ""]
];
