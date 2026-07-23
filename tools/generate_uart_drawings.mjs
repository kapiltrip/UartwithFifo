import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { instance } from "file:///C:/Users/kapil/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@viz-js/viz/dist/viz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "drawing");
await fs.mkdir(out, { recursive: true });

const viz = await instance();
const palette = {
  navy: "#002060",
  blue: "#0563C1",
  paleBlue: "#D9E1F2",
  green: "#CCFFCC",
  yellow: "#FFFF99",
  red: "#B42318",
  ink: "#17233D",
  muted: "#5F6B7A",
  line: "#AEB9CC",
  paper: "#F7F9FC",
};

async function renderDot(name, dot) {
  let svg = viz.renderString(dot, { format: "svg", engine: "dot" });
  svg = svg
    .replace(/<\?xml[^>]*>\s*/g, "")
    .replace(/<!DOCTYPE[^>]*>\s*/g, "")
    .replace(/<svg width="[^"]+" height="[^"]+"/, '<svg width="100%" height="100%"')
    .replace("<svg ", '<svg role="img" ');
  await fs.writeFile(path.join(out, name), svg, "utf8");
  return svg;
}

const graphBase = `
  graph [bgcolor="transparent", pad="0.35", nodesep="0.7", ranksep="0.95", fontname="Aptos"];
  node [shape=ellipse, style="filled", fillcolor="white", color="${palette.navy}", penwidth=2.2, fontname="Aptos", fontcolor="${palette.ink}", fontsize=14, margin="0.16,0.10"];
  edge [color="${palette.blue}", penwidth=2, arrowsize=0.8, fontname="Aptos", fontcolor="${palette.ink}", fontsize=11];
`;

const senderSvg = await renderDot("sender-fsm.svg", `
digraph Sender {
  rankdir=LR; ${graphBase}
  reset [shape=point, width=0.16, fillcolor="${palette.navy}"];
  IDLE [label=<<B>IDLE</B><BR/><FONT POINT-SIZE="11">tx = 1<BR/>index = 0<BR/>busy = 0</FONT>>, fillcolor="${palette.green}"];
  START [label=<<B>START</B><BR/><FONT POINT-SIZE="11">data already latched<BR/>wait for tx_en</FONT>>, fillcolor="${palette.yellow}"];
  DATA [label=<<B>DATA</B><BR/><FONT POINT-SIZE="11">tx = data[index]<BR/>LSB first<BR/>busy = 1</FONT>>, fillcolor="${palette.paleBlue}"];
  STOP [label=<<B>STOP</B><BR/><FONT POINT-SIZE="11">wait for tx_en<BR/>then tx = 1</FONT>>, fillcolor="#FFE2D5"];
  reset -> IDLE [label="rst"];
  IDLE -> START [label="wr_en / data <= data_in"];
  START -> DATA [label="tx_en / tx <= 0, index <= 0"];
  DATA -> DATA [label="tx_en && index < 7 / index++"];
  DATA -> STOP [label="tx_en && index == 7 / tx <= data[7]"];
  STOP -> IDLE [label="tx_en / tx <= 1"];
  IDLE -> IDLE [label="!wr_en"];
  START -> START [label="!tx_en"];
  STOP -> STOP [label="!tx_en"];
}
`);

const receiverSvg = await renderDot("receiver-fsm.svg", `
digraph Receiver {
  rankdir=LR; ${graphBase}
  reset [shape=point, width=0.16, fillcolor="${palette.navy}"];
  IDLE [label=<<B>IDLE</B><BR/><FONT POINT-SIZE="11">sample = 0<BR/>index = 0</FONT>>, fillcolor="${palette.green}"];
  START [label=<<B>START</B><BR/><FONT POINT-SIZE="11">confirm low at<BR/>sample == 7</FONT>>, fillcolor="${palette.yellow}"];
  DATA [label=<<B>DATA</B><BR/><FONT POINT-SIZE="11">at sample == 15:<BR/>temp[index] &lt;= rx</FONT>>, fillcolor="${palette.paleBlue}"];
  STOP [label=<<B>STOP</B><BR/><FONT POINT-SIZE="11">at sample == 15:<BR/>check rx == 1</FONT>>, fillcolor="#FFE2D5"];
  reset -> IDLE [label="rst"];
  IDLE -> START [label="rx_en && rx == 0"];
  START -> DATA [label="rx_en && sample == 7 && rx == 0"];
  START -> IDLE [label="sample == 7 && rx == 1\\nfalse start"];
  DATA -> DATA [label="sample == 15 && index < 7\\nsample bit, index++"];
  DATA -> STOP [label="sample == 15 && index == 7\\nsample data[7]"];
  STOP -> IDLE [label="sample == 15\\nrx == 1: data_out <= temp, rdy <= 1\\nrx == 0: discard"];
  IDLE -> IDLE [label="rx_en && rx == 1"];
}
`);

const brgSvg = await renderDot("brg-flow.svg", `
digraph BRG {
  rankdir=TB; ${graphBase}
  label=<<B>Two parallel counter machines — no encoded FSM state register</B>>;
  labelloc="t"; fontsize=17; fontcolor="${palette.navy}";
  reset [shape=point, width=0.16, fillcolor="${palette.navy}"];
  reset -> TXCOUNT [label="reset"];
  reset -> RXCOUNT [label="reset"];
  subgraph cluster_tx {
    label="TX path"; color="${palette.line}"; style="rounded";
    TXCOUNT [shape=box, style="rounded,filled", fillcolor="${palette.paleBlue}", label=<<B>COUNT TX</B><BR/><FONT POINT-SIZE="11">tx_enable = 0<BR/>tx_counter++</FONT>>];
    TXPULSE [shape=box, style="rounded,filled", fillcolor="${palette.green}", label=<<B>PULSE</B><BR/><FONT POINT-SIZE="11">when tx_counter == TX_DIV - 1<BR/>tx_counter = 0<BR/>tx_enable = 1 for one clk</FONT>>];
    TXCOUNT -> TXCOUNT [label="tx_counter < TX_DIV - 1"];
    TXCOUNT -> TXPULSE [label="terminal count"];
    TXPULSE -> TXCOUNT [label="next clk"];
  }
  subgraph cluster_rx {
    label="RX 16× path"; color="${palette.line}"; style="rounded";
    RXCOUNT [shape=box, style="rounded,filled", fillcolor="#F0E7FF", label=<<B>COUNT RX</B><BR/><FONT POINT-SIZE="11">rx_en = 0<BR/>rx_counter++</FONT>>];
    RXPULSE [shape=box, style="rounded,filled", fillcolor="${palette.yellow}", label=<<B>PULSE</B><BR/><FONT POINT-SIZE="11">when rx_counter == RX_DIV - 1<BR/>rx_counter = 0<BR/>rx_en = 1 for one clk</FONT>>];
    RXCOUNT -> RXCOUNT [label="rx_counter < RX_DIV - 1"];
    RXCOUNT -> RXPULSE [label="terminal count"];
    RXPULSE -> RXCOUNT [label="next clk"];
  }
}
`);

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
}

function makeTimingSvg() {
  const W = 1600;
  const H = 1010;
  const left = 285;
  const top = 122;
  const bitW = 104;
  const rowH = 83;
  const labels = ["IDLE", "START", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "STOP", "IDLE"];
  const tx = [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1];
  const rows = ["wr_en", "tx_start", "tx_clock_enable", "tx_line", "rx_en", "rx_inst sample", "rx_byte_ready", "rdy", "rdy_clr", "data_out[7:0]"];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">`,
    `<title id="title">UART loopback signal timing for data 8'hA5</title>`,
    `<desc id="desc">Timing diagram using the real RTL signal names, with a low start bit, LSB-first data, a high stop bit, 16-times receiver enable pulses, and receive-ready handshaking.</desc>`,
    `<rect width="${W}" height="${H}" rx="28" fill="#FFFFFF"/>`,
    `<text x="54" y="52" font-family="Aptos,Segoe UI,sans-serif" font-size="30" font-weight="700" fill="${palette.navy}">Loopback timing — data_in[7:0] = 8'hA5</text>`,
    `<text x="54" y="84" font-family="Aptos,Segoe UI,sans-serif" font-size="16" fill="${palette.muted}">Actual top-level/internal names from uart_top.v · UART sends 1010_0101 as d0…d7 = 1,0,1,0,0,1,0,1</text>`];

  labels.forEach((label, i) => {
    const x = left + i * bitW;
    const fill = label === "START" ? "#FFF3BF" : label === "STOP" ? "#FFE2D5" : label.startsWith("d") ? "#EDF4FF" : "#F6F8FB";
    parts.push(`<rect x="${x}" y="${top - 34}" width="${bitW}" height="34" fill="${fill}" stroke="#D7DEEA"/>`);
    parts.push(`<text x="${x + bitW / 2}" y="${top - 12}" text-anchor="middle" font-family="Aptos,Segoe UI,sans-serif" font-size="14" font-weight="700" fill="${palette.ink}">${label}</text>`);
  });

  for (let i = 0; i <= labels.length; i++) {
    const x = left + i * bitW;
    parts.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + rows.length * rowH}" stroke="#DFE5EE" stroke-width="1"/>`);
  }
  rows.forEach((label, r) => {
    const y = top + r * rowH;
    parts.push(`<rect x="32" y="${y}" width="${W - 64}" height="${rowH}" fill="${r % 2 ? "#FBFCFE" : "#FFFFFF"}"/>`);
    parts.push(`<line x1="32" y1="${y + rowH}" x2="${W - 32}" y2="${y + rowH}" stroke="#E7EBF2"/>`);
    parts.push(`<text x="54" y="${y + 48}" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="17" font-weight="700" fill="${palette.ink}">${esc(label)}</text>`);
  });

  const hi = (r) => top + r * rowH + 21;
  const lo = (r) => top + r * rowH + 60;
  const digital = (r, values, color = palette.navy) => {
    let d = `M ${left} ${values[0] ? hi(r) : lo(r)}`;
    values.forEach((v, i) => {
      const x1 = left + (i + 1) * bitW;
      d += ` H ${x1}`;
      if (i < values.length - 1 && values[i + 1] !== v) d += ` V ${values[i + 1] ? hi(r) : lo(r)}`;
    });
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>`);
  };
  const pulse = (r, x, width = 14, color = palette.blue) => {
    parts.push(`<path d="M ${x - width} ${lo(r)} H ${x} V ${hi(r)} H ${x + width} V ${lo(r)} H ${x + width * 2}" fill="none" stroke="${color}" stroke-width="3"/>`);
  };

  pulse(0, left + 34, 8);
  pulse(1, left + bitW - 24, 8);
  for (let i = 1; i <= 11; i++) pulse(2, left + i * bitW, 5, "#7A3EF0");
  digital(3, tx, palette.navy);

  const rxY0 = lo(4);
  parts.push(`<line x1="${left}" y1="${rxY0}" x2="${left + labels.length * bitW}" y2="${rxY0}" stroke="#7A3EF0" stroke-width="2"/>`);
  for (let b = 1; b <= 10; b++) {
    for (let s = 0; s < 16; s++) {
      const x = left + b * bitW + (s * bitW) / 16;
      parts.push(`<line x1="${x}" y1="${rxY0}" x2="${x}" y2="${rxY0 - (s % 4 === 0 ? 24 : 13)}" stroke="#7A3EF0" stroke-width="1.2"/>`);
    }
  }
  parts.push(`<text x="${left + bitW * 1.15}" y="${hi(4) + 6}" font-family="Aptos,Segoe UI,sans-serif" font-size="14" fill="#6D28D9">16 rx_en pulses per bit</text>`);

  parts.push(`<line x1="${left}" y1="${lo(5)}" x2="${left + labels.length * bitW}" y2="${lo(5)}" stroke="#9AA6B8" stroke-width="2"/>`);
  for (let b = 1; b <= 10; b++) {
    const x = left + b * bitW + bitW / 2;
    const label = b === 1 ? "sample==7" : "sample==15";
    parts.push(`<line x1="${x}" y1="${top + 3 * rowH + 8}" x2="${x}" y2="${lo(5) + 8}" stroke="${palette.red}" stroke-width="1.4" stroke-dasharray="5 6"/>`);
    parts.push(`<circle cx="${x}" cy="${lo(5)}" r="6" fill="${palette.red}"/>`);
    if (b === 1 || b === 2 || b === 10) parts.push(`<text x="${x}" y="${hi(5) + 5}" text-anchor="middle" font-family="Aptos,Segoe UI,sans-serif" font-size="12" fill="${palette.red}">${label}</text>`);
  }

  pulse(6, left + 10.55 * bitW, 7, "#00875A");
  const rdyVals = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  digital(7, rdyVals, "#00875A");
  pulse(8, left + 11.55 * bitW, 7, palette.red);

  const busY = top + 9 * rowH + 42;
  const changeX = left + 10.65 * bitW;
  parts.push(`<line x1="${left}" y1="${busY}" x2="${changeX - 10}" y2="${busY}" stroke="${palette.blue}" stroke-width="3"/>`);
  parts.push(`<path d="M ${changeX - 10} ${busY} L ${changeX + 10} ${busY - 16} M ${changeX - 10} ${busY} L ${changeX + 10} ${busY + 16}" stroke="${palette.blue}" stroke-width="3"/>`);
  parts.push(`<line x1="${changeX + 10}" y1="${busY - 16}" x2="${left + labels.length * bitW}" y2="${busY - 16}" stroke="${palette.blue}" stroke-width="3"/>`);
  parts.push(`<line x1="${changeX + 10}" y1="${busY + 16}" x2="${left + labels.length * bitW}" y2="${busY + 16}" stroke="${palette.blue}" stroke-width="3"/>`);
  parts.push(`<text x="${changeX + 45}" y="${busY + 6}" font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="17" font-weight="700" fill="${palette.blue}">8'hA5</text>`);

  parts.push(`<rect x="54" y="${H - 66}" width="${W - 108}" height="42" rx="12" fill="#FFF7D6" stroke="#E9C84A"/>`);
  parts.push(`<text x="76" y="${H - 39}" font-family="Aptos,Segoe UI,sans-serif" font-size="15" fill="${palette.ink}">Current RTL detail: busy = (state != IDLE), so busy can fall when the stop bit begins; tx_line still remains high for the full stop-bit interval.</text>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

const timingSvg = makeTimingSvg();
await fs.writeFile(path.join(out, "signal-timing.svg"), timingSvg, "utf8");

function node(id, value, x, y, w, h, style = "rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#002060;strokeWidth=2;fontSize=15;fontColor=#17233D;") {
  return `<mxCell id="${id}" value="${esc(value)}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}
function edge(id, source, target, value, style = "edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#0563C1;strokeWidth=2;endArrow=block;endFill=1;fontSize=13;fontColor=#17233D;") {
  return `<mxCell id="${id}" value="${esc(value)}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
}
function page(name, body, width = 1700, height = 1000) {
  return `<diagram id="${name.toLowerCase().replace(/\W/g, "-")}" name="${esc(name)}"><mxGraphModel dx="1400" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${body}</root></mxGraphModel></diagram>`;
}

const titleStyle = "text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=28;fontStyle=1;fontColor=#002060;";
const stateStyle = "ellipse;whiteSpace=wrap;html=1;fillColor=#D9E1F2;strokeColor=#002060;strokeWidth=3;fontSize=16;fontColor=#17233D;";
const idleStyle = stateStyle.replace("#D9E1F2", "#CCFFCC");
const startStyle = stateStyle.replace("#D9E1F2", "#FFFF99");
const stopStyle = stateStyle.replace("#D9E1F2", "#FFE2D5");

let senderCells = node("st", "Sender FSM — uart_sender.v", 50, 30, 700, 50, titleStyle);
senderCells += node("s0", "<b>IDLE</b><br>tx = 1<br>index = 0<br>busy = 0", 80, 330, 210, 160, idleStyle);
senderCells += node("s1", "<b>START</b><br>data latched<br>wait for tx_en", 440, 330, 210, 160, startStyle);
senderCells += node("s2", "<b>DATA</b><br>tx = data[index]<br>LSB first", 800, 330, 210, 160, stateStyle);
senderCells += node("s3", "<b>STOP</b><br>wait for tx_en<br>then tx = 1", 1160, 330, 210, 160, stopStyle);
senderCells += edge("se0", "s0", "s1", "wr_en / data <= data_in");
senderCells += edge("se1", "s1", "s2", "tx_en / tx <= 0, index <= 0");
senderCells += edge("se2", "s2", "s3", "tx_en && index == 7 / tx <= data[7]");
senderCells += edge("se3", "s3", "s0", "tx_en / tx <= 1");
senderCells += edge("se4", "s2", "s2", "tx_en && index < 7 / index++", "edgeStyle=orthogonalEdgeStyle;loopDirection=1;html=1;strokeColor=#0563C1;strokeWidth=2;endArrow=block;endFill=1;fontSize=13;");
senderCells += node("sn", "busy is combinational: state != IDLE. In this implementation it falls when the stop bit starts, not after the stop interval.", 420, 650, 680, 90, "rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF7D6;strokeColor=#E9C84A;fontSize=16;fontColor=#17233D;");

let receiverCells = node("rt", "Receiver FSM — uart_receiver.v", 50, 30, 780, 50, titleStyle);
receiverCells += node("r0", "<b>IDLE</b><br>sample = 0<br>index = 0", 70, 340, 210, 160, idleStyle);
receiverCells += node("r1", "<b>START</b><br>validate low at<br>sample == 7", 430, 340, 210, 160, startStyle);
receiverCells += node("r2", "<b>DATA</b><br>sample temp[index]<br>at sample == 15", 790, 340, 210, 160, stateStyle);
receiverCells += node("r3", "<b>STOP</b><br>check rx at<br>sample == 15", 1150, 340, 210, 160, stopStyle);
receiverCells += edge("re0", "r0", "r1", "rx_en && rx == 0");
receiverCells += edge("re1", "r1", "r2", "sample == 7 && rx == 0");
receiverCells += edge("re2", "r2", "r3", "sample == 15 && index == 7");
receiverCells += edge("re3", "r3", "r0", "sample == 15 / valid stop: data_out <= temp, rdy <= 1");
receiverCells += edge("re4", "r1", "r0", "sample == 7 && rx == 1 / false start", "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;strokeColor=#B42318;strokeWidth=2;endArrow=block;endFill=1;fontSize=13;");
receiverCells += edge("re5", "r2", "r2", "sample == 15 && index < 7 / index++", "edgeStyle=orthogonalEdgeStyle;loopDirection=1;html=1;strokeColor=#0563C1;strokeWidth=2;endArrow=block;endFill=1;fontSize=13;");
receiverCells += node("rn", "rdy_clr clears rdy independently. A low stop bit is discarded, but there is no framing_error output.", 430, 670, 650, 90, "rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF7D6;strokeColor=#E9C84A;fontSize=16;fontColor=#17233D;");

let brgCells = node("bt", "Baud-rate generator — two counter machines", 50, 30, 900, 50, titleStyle);
brgCells += node("btx0", "<b>TX COUNT</b><br>tx_enable = 0<br>tx_counter++", 190, 260, 290, 150, stateStyle.replace("ellipse", "rounded=1"));
brgCells += node("btx1", "<b>TX PULSE</b><br>tx_counter = 0<br>tx_enable = 1 for one clk", 190, 590, 290, 150, idleStyle.replace("ellipse", "rounded=1"));
brgCells += edge("bte0", "btx0", "btx1", "tx_counter == TX_DIV - 1");
brgCells += edge("bte1", "btx1", "btx0", "next clk");
brgCells += node("brx0", "<b>RX COUNT</b><br>rx_en = 0<br>rx_counter++", 870, 260, 290, 150, stateStyle.replace("ellipse", "rounded=1").replace("#D9E1F2", "#F0E7FF"));
brgCells += node("brx1", "<b>RX PULSE</b><br>rx_counter = 0<br>rx_en = 1 for one clk", 870, 590, 290, 150, startStyle.replace("ellipse", "rounded=1"));
brgCells += edge("bre0", "brx0", "brx1", "rx_counter == RX_DIV - 1");
brgCells += edge("bre1", "brx1", "brx0", "next clk");
brgCells += node("bn", "Default relationship: TX_DIV = 5208 and RX_DIV = 325. At 50 MHz this is approximately 9600 baud with a 16× receive-enable cadence.", 490, 820, 640, 90, "rounded=1;whiteSpace=wrap;html=1;fillColor=#FFF7D6;strokeColor=#E9C84A;fontSize=16;fontColor=#17233D;");

const timingData = Buffer.from(timingSvg, "utf8").toString("base64");
let timingCells = node("tt", "Signal timing — real uart_top signal names", 50, 20, 900, 50, titleStyle);
timingCells += `<mxCell id="timing-image" value="" style="shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;aspect=fixed;image=data:image/svg+xml,${timingData};" vertex="1" parent="1"><mxGeometry x="40" y="90" width="1520" height="960" as="geometry"/></mxCell>`;

const drawio = `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="Codex" version="24.7.17" compressed="false">${page("Sender FSM", senderCells)}${page("Receiver FSM", receiverCells)}${page("BRG flow", brgCells)}${page("Signal timing", timingCells, 1650, 1120)}</mxfile>\n`;
await fs.writeFile(path.join(root, "sketch.drawio"), drawio, "utf8");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>UART FSM & Signal Drawings</title>
  <style>
    :root{--navy:#002060;--blue:#0563C1;--ink:#17233D;--muted:#5F6B7A;--line:#D9E1F2;--paper:#F5F7FB;--green:#CCFFCC;--yellow:#FFFF99;--red:#B42318}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Aptos,"Segoe UI",system-ui,sans-serif;line-height:1.55}
    header{background:var(--navy);color:white;padding:54px max(28px,calc((100vw - 1180px)/2));position:relative;overflow:hidden}header:after{content:"";position:absolute;right:-100px;top:-160px;width:420px;height:420px;border:70px solid rgba(255,255,255,.08);border-radius:50%}
    .eyebrow{font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#BBD7FF;font-size:.78rem}h1{font-size:clamp(2.2rem,5vw,4.6rem);line-height:1.02;margin:.35rem 0 1rem;max-width:900px}.lede{font-size:1.12rem;max-width:850px;color:#E3EEFF}
    nav{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}nav div{max-width:1180px;margin:auto;display:flex;gap:10px;padding:11px 24px;overflow:auto}nav a{white-space:nowrap;color:var(--navy);text-decoration:none;font-weight:750;padding:7px 11px;border-radius:8px}nav a:hover{background:#EAF2FF}
    main{max-width:1180px;margin:0 auto;padding:38px 24px 80px}.verdict{display:grid;grid-template-columns:1.25fr .75fr;gap:24px;background:white;border:1px solid var(--line);border-left:7px solid #16865D;border-radius:16px;padding:25px 28px;box-shadow:0 12px 30px rgba(0,32,96,.07)}.verdict h2{margin:0 0 8px;font-size:1.55rem;color:var(--navy)}.badge{display:inline-block;background:var(--green);color:#07593F;font-weight:850;padding:6px 10px;border-radius:999px;font-size:.82rem}.metric{align-self:center;background:#F1F6FF;border-radius:12px;padding:18px;text-align:center}.metric strong{font-size:2.2rem;color:var(--navy);display:block}.metric span{color:var(--muted)}
    section{scroll-margin-top:80px;margin-top:34px}.figure{background:white;border:1px solid var(--line);border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(0,32,96,.06)}.figure-head{padding:25px 28px 0}.figure h2{margin:0;color:var(--navy);font-size:1.65rem}.figure p{color:var(--muted);max-width:900px}.canvas{padding:18px 22px 30px;background:linear-gradient(180deg,#fff,#F8FAFD)}.canvas img{display:block;width:100%;max-height:790px;object-fit:contain}.timing img{max-height:none}
    .audit{margin-top:34px;background:white;border:1px solid var(--line);border-radius:18px;padding:26px 28px}.audit h2{margin-top:0;color:var(--navy)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:14px 12px;border-bottom:1px solid #E7EBF2;vertical-align:top}th{color:var(--navy);font-size:.82rem;text-transform:uppercase;letter-spacing:.06em}.pass,.attention{font-weight:850}.pass{color:#087455}.attention{color:#9A5B00}code{background:#EEF3FA;padding:.12rem .35rem;border-radius:5px;color:#153A70}
    .sources{background:#EAF2FF;border-radius:16px;padding:22px 26px}.sources h2{margin-top:0;color:var(--navy)}.sources a{color:var(--blue)}footer{color:var(--muted);padding-top:30px;font-size:.9rem}
    @media(max-width:760px){.verdict{grid-template-columns:1fr}header{padding-top:38px}.canvas{padding:8px}th:first-child{width:90px}}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">UART loopback · verified reference</div>
    <h1>FSMs, baud enables, and real signal timing</h1>
    <p class="lede">Drawn from <code>uart_sender.v</code>, <code>uart_receiver.v</code>, <code>baud_rate_generator.v</code>, and <code>uart_top.v</code>. The drawings preserve the RTL’s exact signal names and conditions.</p>
  </header>
  <nav><div><a href="#verdict">Verdict</a><a href="#sender">Sender FSM</a><a href="#receiver">Receiver FSM</a><a href="#brg">BRG</a><a href="#signals">Signals</a><a href="#standard">Standard check</a></div></nav>
  <main>
    <section id="verdict" class="verdict">
      <div><span class="badge">FUNCTIONAL LOOPBACK PASS</span><h2>The frame logic is correct; the interface is not production-complete.</h2><p>The current self-checking testbench passes all 12 cases. The line is idle-high, sends one low start bit, eight data bits LSB-first, and one high stop bit. Receiver alignment and midpoint sampling are correct for the implemented 16× enable.</p></div>
      <div class="metric"><strong>12 / 12</strong><span>current tests passed at 4098 ns</span></div>
    </section>

    <section id="sender" class="figure"><div class="figure-head"><h2>Sender FSM</h2><p><code>wr_en</code> latches <code>data_in</code>; every serialized phase change is gated by <code>tx_en</code> (connected to <code>tx_clock_enable</code> in the top level).</p></div><div class="canvas"><img src="sender-fsm.svg" alt="UART sender finite-state machine"></div></section>
    <section id="receiver" class="figure"><div class="figure-head"><h2>Receiver FSM</h2><p>The handwritten sketch’s start-to-data label is corrected here: the start bit is checked at <code>sample == 7</code>. Each data bit and the stop bit are then sampled at <code>sample == 15</code>.</p></div><div class="canvas"><img src="receiver-fsm.svg" alt="UART receiver finite-state machine"></div></section>
    <section id="brg" class="figure"><div class="figure-head"><h2>Baud-rate generator flow</h2><p>The BRG is not an encoded FSM. It is two independent counters that emit one-system-clock enable pulses: <code>tx_enable</code> once per UART bit and <code>rx_en</code> at the receiver oversampling cadence.</p></div><div class="canvas"><img src="brg-flow.svg" alt="Baud rate generator counter flow"></div></section>
    <section id="signals" class="figure timing"><div class="figure-head"><h2>Signal timing, styled after the notebook sketch</h2><p>Example byte <code>8'hA5</code>. Red markers show the receiver decision points; the line carries <code>d0</code> first. The page uses internal top-level names such as <code>tx_start</code>, <code>tx_clock_enable</code>, <code>tx_line</code>, <code>rx_en</code>, and <code>rx_byte_ready</code>.</p></div><div class="canvas"><img src="signal-timing.svg" alt="UART timing diagram for data A5"></div></section>

    <section id="standard" class="audit">
      <h2>Check against conventional UART 8-N-1 behavior</h2>
      <table>
        <thead><tr><th>Result</th><th>Item</th><th>Finding</th></tr></thead>
        <tbody>
          <tr><td class="pass">PASS</td><td>Frame polarity and order</td><td><code>tx</code>/<code>tx_line</code> is idle-high, start-low, sends <code>data[0]</code> through <code>data[7]</code>, then drives a high stop bit.</td></tr>
          <tr><td class="pass">PASS</td><td>Receiver timing</td><td>The start bit is rechecked halfway through its cell and later bits are sampled one bit-period apart. That matches the common 16× midpoint method.</td></tr>
          <tr><td class="attention">ATTENTION</td><td>Top-level interface</td><td><code>uart_top</code> loops <code>tx_line</code> directly into <code>rx_inst.rx</code>; it has no external <code>rx</code> input or <code>tx</code> output, so it is not yet a physical UART top level.</td></tr>
          <tr><td class="attention">ATTENTION</td><td>Asynchronous RX safety</td><td>There is no two-flop synchronizer before the receiver. The loopback is same-clock, but an external RX pin would need synchronization to reduce metastability risk.</td></tr>
          <tr><td class="attention">ATTENTION</td><td>Noise and errors</td><td>The receiver takes one sample per bit and silently discards a low stop bit. Production UARTs commonly expose framing/overrun status; many use majority voting around the midpoint.</td></tr>
          <tr><td class="attention">ATTENTION</td><td><code>busy</code> meaning</td><td>Because <code>busy = (state != IDLE)</code> and STOP transitions to IDLE when the stop level is launched, <code>busy</code> can fall at the beginning of the stop bit rather than after its full duration.</td></tr>
          <tr><td class="attention">ATTENTION</td><td>Divider parameter widths</td><td><code>tx_counter[12:0]</code> and <code>rx_counter[9:0]</code> fit 5208 and 325, but wider divider parameters would overflow. Deriving widths with <code>$clog2</code> would make the parameters safe.</td></tr>
          <tr><td class="attention">ATTENTION</td><td>FIFO overflow visibility</td><td>The TX FIFO <code>full</code> output is unused and the RX full condition has no exported overflow flag. Data can be dropped without the user interface reporting it.</td></tr>
        </tbody>
      </table>
    </section>

    <section class="sources"><h2>Engineering references used for the standard check</h2><ul><li><a href="https://docs.amd.com/api/khub/documents/kZgdmmRJRdvf7CGkPHaKSg/content">AMD/Xilinx XAPP341 — UARTs in Xilinx CPLDs</a></li><li><a href="https://docs.amd.com/api/khub/documents/Hi4oaMZcNRihEtKQHzgo1w/content">AMD/Xilinx XAPP223 — 200 MHz UART with Internal 16-Byte Buffer</a></li><li><a href="https://onlinedocs.microchip.com/oxy/GUID-A9964E93-D46C-42E6-98D2-4ED783ABB2CE-en-US-2/GUID-7BA3A2AA-EFBF-4C3A-BB96-17B8A413DE69.html">Microchip USART principle of operation</a></li><li><a href="https://onlinedocs.microchip.com/oxy/GUID-0EC909F9-8FB7-46B2-BF4B-05290662B5C3-en-US-12.1.1/GUID-EF70F12B-3E50-4DB6-9045-D9B0DC1CE30E.html">Microchip asynchronous clock recovery</a></li></ul></section>
    <footer>Editable multi-page source: <code>../sketch.drawio</code> · Generated from the current RTL in this repository.</footer>
  </main>
</body>
</html>`;

await fs.writeFile(path.join(out, "index.html"), html, "utf8");
console.log(`Created ${path.join(root, "sketch.drawio")} and ${out}`);
