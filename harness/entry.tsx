import { ThemeStore } from "./runtime";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { FilePreview } from "../plugin/filePreview/Preview";
import "../plugin/filePreview/style.css";

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
`;

const htmlSample = "<h1>HTML file preview</h1><p>Readable <strong>HTML</strong>, isolated from Discord.</p><ul><li>Lists</li><li>Tables</li></ul><table><tr><th>Format</th><th>View</th></tr><tr><td>HTML</td><td>Preview</td></tr></table><pre><code>const mode = \"Preview\";</code></pre><a href=\"https://tracking.invalid/leave\" target=\"_top\">Navigation is disabled</a><img src=\"https://tracking.invalid/image\" alt=\"Remote image\"><script>parent.htmlExecuted=true;fetch(\"https://tracking.invalid/script\");window.open(\"https://tracking.invalid/popup\");</script><style>@import \"https://tracking.invalid/style\";</style><form action=\"https://tracking.invalid/form\"><input value=\"no\"></form><iframe src=\"https://tracking.invalid/frame\"></iframe><meta http-equiv=\"refresh\" content=\"0;url=https://tracking.invalid/refresh\">";

const root = createRoot(document.getElementById("root")!);
function App() {
    const [light, setLight] = React.useState(false);
    const [visible, setVisible] = React.useState(true);
    const [version, setVersion] = React.useState(0);
    ThemeStore.theme = light ? "light" : "dark";
    React.useEffect(() => { document.body.className = light ? "light" : "dark"; }, [light]);
    return <main>
        <header><div><h1>File attachment preview</h1><p>Synthetic test harness · no Discord account or attachment requests</p></div><button id="theme" onClick={() => setLight(!light)}>Switch theme</button></header>
        <div className="harness-controls"><button id="rerender" onClick={() => setVersion(version + 1)}>Rerender ({version})</button><button id="remount" onClick={() => setVisible(!visible)}>Unmount / mount</button></div>
        {visible && <div className="card" id="main-card"><FilePreview fileName="notes.md" fileContents={sample} bytesLeft={0} raw={<pre className="native-raw">{sample}</pre>} /><footer>notes.md · <a download="notes.md" href={"data:text/plain;charset=utf-8," + encodeURIComponent(sample)}>Download original</a></footer></div>}
        <div className="card" id="html-card"><FilePreview fileName="page.HTML" fileContents={htmlSample} bytesLeft={0} raw={<pre className="native-raw">{htmlSample}</pre>} /></div>
        <div className="card" id="html-partial-card"><FilePreview fileName="partial.htm" fileContents="<h1>Partial</h1>" bytesLeft={8} raw={<pre className="native-raw">Partial HTML</pre>} /></div>
        <div className="card" id="other-card"><FilePreview fileName="other.MARKDOWN" fileContents="# Another attachment\n\nIndependent state." bytesLeft={0} raw={<pre className="native-raw"># Another attachment</pre>} /></div>
        <div className="card" id="partial-card"><FilePreview fileName="partial.md" fileContents="# Partial content" bytesLeft={512} raw={<pre className="native-raw"># Partial content</pre>} /></div>
        <div className="card" id="large-card"><FilePreview fileName="large.md" fileContents={"x".repeat(66000)} bytesLeft={0} raw={<pre className="native-raw">Large original source remains available</pre>} /></div>
    </main>;
}
root.render(<App />);
