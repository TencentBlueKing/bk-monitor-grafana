export default (userName: string): string =>
  userName
    ? `data:image/svg+xml;base64,${window.btoa(
        unescape(
          encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg"
 width="160" height="160" viewbox="0 0 160 160">
<text x="80"
  y="80"
  text-anchor="middle"
  stroke="#aaa"
  stroke-width="1"
  stroke-opacity=".2"
  fill="none"
  transform="rotate(-45)"
  transform-origin="center"
  style="font-size: 12px;">
  ${userName}
</text>
</svg>`)
        )
      )}`
    : '';
