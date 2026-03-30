function parsePorts(portsStr: string) {
  if (!portsStr || portsStr === "—") return [];
  return portsStr.split(", ").map(part => {
    if (part.includes("->")) {
      const [hostPart, containerPart] = part.split("->");
      // hostPart could be "0.0.0.0:8080" or ":::8080" or "127.0.0.1:3000"
      const portMatch = hostPart.match(/:(\d+)$/);
      const port = portMatch ? portMatch[1] : null;
      return { text: part, url: port ? `http://localhost:${port}` : null };
    }
    return { text: part, url: null };
  });
}

console.log(parsePorts("0.0.0.0:8080->8080/tcp, :::8080->8080/tcp"));
console.log(parsePorts("80/tcp"));
console.log(parsePorts("127.0.0.1:9001->9000/tcp"));
