"use client";

interface Props {
  content: string;
}

// Lightweight markdown renderer — no dependencies
// Handles: headings, bold, italic, code blocks, inline code, lists, hr, blockquote
export default function MarkdownRenderer({ content }: Props) {
  const html = renderMarkdown(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const output: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuffer: string[] = [];
  let inBlockquote = false;

  const flushCode = () => {
    if (codeBuffer.length) {
      const escaped = escapeHtml(codeBuffer.join("\n"));
      output.push(`<pre><code class="language-${codeLang}">${escaped}</code></pre>`);
      codeBuffer = [];
      codeLang = "";
    }
    inCode = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fence
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      if (!inBlockquote) { output.push("<blockquote>"); inBlockquote = true; }
      output.push(inlineFormat(line.slice(2)));
      continue;
    } else if (inBlockquote) {
      output.push("</blockquote>");
      inBlockquote = false;
    }

    // Headings
    if (line.startsWith("### ")) { output.push(`<h3>${inlineFormat(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("## ")) { output.push(`<h2>${inlineFormat(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("# ")) { output.push(`<h1>${inlineFormat(line.slice(2))}</h1>`); continue; }

    // HR
    if (/^[-*_]{3,}$/.test(line.trim())) { output.push("<hr>"); continue; }

    // Unordered list
    if (/^[-*+] /.test(line)) { output.push(`<ul><li>${inlineFormat(line.slice(2))}</li></ul>`); continue; }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\. /, "");
      output.push(`<ol><li>${inlineFormat(text)}</li></ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") { output.push("<p></p>"); continue; }

    // Paragraph
    output.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inCode) flushCode();
  if (inBlockquote) output.push("</blockquote>");

  // Merge consecutive list items
  return output
    .join("")
    .replace(/<\/ul><ul>/g, "")
    .replace(/<\/ol><ol>/g, "");
}

function inlineFormat(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-blue-400 hover:underline">$1</a>');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
