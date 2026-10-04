import { ThemeStore } from "./runtime";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { FilePreview } from "../plugin/filePreview/Preview";
import "../plugin/filePreview/style.css";
import { csvSample, hostileSvg, svgSample } from "./samples.mjs";
import { MAX_BYTES } from "../plugin/filePreview/markdown";

const sample = `# Markdown in Discord

Switch between the **original source** and a readable preview.

## Project notes
- Headings and nested lists
  - Keep the original download
- **Bold**, *italic*, and \`inline code\`

| Feature | Status |
| :-- | :-- |
| Raw / Preview | Ready |
| Tables and code | Included |

\`\`\`ts
const view = "Preview";
console.log(view);
\`\`\`

[Open Vencord docs](https://docs.vencord.dev)

![Remote image](https://tracking.example/pixel.png)

<script>window.evil = true</script>

[Unsafe link](javascript:alert%281%29)

---

First line${"  "}
Second line.
`;

const htmlSample = "<h1>HTML file preview</h1><p>Readable <strong>HTML</strong>, isolated from Discord.</p><ul><li>Lists</li><li>Tables</li></ul><table><tr><th>Format</th><th>View</th></tr><tr><td>HTML</td><td>Preview</td></tr></table><pre><code>const mode = \"Preview\";</code></pre><a href=\"https://tracking.invalid/leave\" target=\"_top\">Navigation is disabled</a><img src=\"https://tracking.invalid/image\" alt=\"Remote image\"><script>parent.htmlExecuted=true;fetch(\"https://tracking.invalid/script\");window.open(\"https://tracking.invalid/popup\");</script><style>@import \"https://tracking.invalid/style\";</style><form action=\"https://tracking.invalid/form\"><input value=\"no\"></form><iframe src=\"https://tracking.invalid/frame\"></iframe><meta http-equiv=\"refresh\" content=\"0;url=https://tracking.invalid/refresh\">";

const root = createRoot(document.getElementById("root")!);
function App() {
    const [light, setLight] = React.useState(false);
    const [visible, setVisible] = React.useState(true);
    const [version, setVersion] = React.useState(0);
    const [expanded, setExpanded] = React.useState(false);
    const [expandedSvg, setExpandedSvg] = React.useState(false);
    ThemeStore.theme = light ? "light" : "dark";
    React.useEffect(() => { document.body.className = light ? "light" : "dark"; }, [light]);
    return <main>
        <header><div><h1>File attachment preview</h1><p>Synthetic test harness · no Discord account or attachment requests</p></div><button id="theme" onClick={() => setLight(!light)}>Switch theme</button></header>
        <div className="harness-controls"><button id="rerender" onClick={() => setVersion(version + 1)}>Rerender ({version})</button><button id="remount" onClick={() => setVisible(!visible)}>Unmount / mount</button></div>
        {visible && <div className="card" id="main-card"><FilePreview fileName="notes.md" fileContents={sample} bytesLeft={0} raw={<pre className="native-raw">{sample}</pre>} /><footer>notes.md · <a download="notes.md" href={"data:text/plain;charset=utf-8," + encodeURIComponent(sample)}>Download original</a></footer></div>}
        <div className="card" id="html-card"><FilePreview fileName="page.HTML" fileContents={htmlSample} bytesLeft={0} raw={<pre className="native-raw">{htmlSample}</pre>} /></div>
        <div className="card" id="html-partial-card"><FilePreview fileName="partial.htm" fileContents="<h1>Partial</h1>" bytesLeft={8} raw={<pre className="native-raw">Partial HTML</pre>} /></div>
        <div className="card" id="csv-card"><FilePreview fileName="sample.CSV" fileContents={csvSample} bytesLeft={0} raw={<pre className="native-raw">{csvSample}</pre>} /><button id="expand-csv" onClick={() => setExpanded(true)}>Open expanded CSV</button></div>
        {expanded && <div className="card" id="csv-modal" role="dialog" aria-modal="true" aria-label="Expanded CSV" onKeyDown={event => { if (event.key === "Escape") setExpanded(false); }}><button id="close-csv" onClick={() => setExpanded(false)}>Close</button><FilePreview fileName="sample.CSV" fileContents={csvSample} bytesLeft={0} raw={<pre className="native-raw">{csvSample}</pre>} /></div>}
        <div className="card" id="csv-empty"><FilePreview fileName="empty.csv" fileContents="" bytesLeft={0} raw={<pre className="native-raw" />} /></div>
        <div className="card" id="csv-invalid"><FilePreview fileName="invalid.csv" fileContents={'"unfinished'} bytesLeft={0} raw={<pre className="native-raw">{'"unfinished'}</pre>} /></div>
        <div className="card" id="csv-limited"><FilePreview fileName="too-many.csv" fileContents={"a\n".repeat(1001)} bytesLeft={0} raw={<pre className="native-raw">CSV original remains available</pre>} /></div>
        <div className="card" id="csv-partial"><FilePreview fileName="partial.csv" fileContents="a,b" bytesLeft={2} raw={<pre className="native-raw">a,b</pre>} /></div>
        <div className="card" id="csv-wide"><FilePreview fileName="wide.csv" fileContents={Array(20).fill("wide cell").join(",")} bytesLeft={0} raw={<pre className="native-raw">Wide CSV original</pre>} /></div>
        <div className="card" id="svg-card"><FilePreview fileName="drawing.SVG" fileContents={svgSample} bytesLeft={0} raw={<pre className="native-raw">{svgSample}</pre>} /><button id="expand-svg" onClick={() => setExpandedSvg(true)}>Open expanded SVG</button></div>
        {expandedSvg && <div className="card" id="svg-modal" role="dialog" aria-modal="true" aria-label="Expanded SVG" onKeyDown={event => { if (event.key === "Escape") setExpandedSvg(false); }}><button id="close-svg" onClick={() => setExpandedSvg(false)}>Close</button><FilePreview fileName="drawing.SVG" fileContents={svgSample} bytesLeft={0} raw={<pre className="native-raw">{svgSample}</pre>} /></div>}
        <div className="card" id="svg-attack"><FilePreview fileName="hostile.svg" fileContents={hostileSvg} bytesLeft={0} raw={<pre className="native-raw">{hostileSvg}</pre>} /></div>
        <div className="card" id="svg-partial"><FilePreview fileName="partial.svg" fileContents="<svg/>" bytesLeft={8} raw={<pre className="native-raw">Partial SVG</pre>} /></div>
        <div className="card" id="svg-limited"><FilePreview fileName="too-many.svg" fileContents={"<svg>" + "<circle/>".repeat(2001) + "</svg>"} bytesLeft={0} raw={<pre className="native-raw">SVG original remains available</pre>} /></div>
        <div className="card" id="other-card"><FilePreview fileName="other.MARKDOWN" fileContents="# Another attachment\n\nIndependent state." bytesLeft={0} raw={<pre className="native-raw"># Another attachment</pre>} /></div>
        <div className="card" id="partial-card"><FilePreview fileName="partial.md" fileContents="# Partial content" bytesLeft={512} raw={<pre className="native-raw"># Partial content</pre>} /></div>
        <div className="card" id="large-card"><FilePreview fileName="large.md" fileContents={"x".repeat(MAX_BYTES + 1)} bytesLeft={0} raw={<pre className="native-raw">Large original source remains available</pre>} /></div>
    </main>;
}
root.render(<App />);
