import re

with open("src/components/ContainerExec.tsx", "r") as f:
    text = f.read()

target = """    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      term.write(data);
    };

    term.onData((data) => {"""

replace = """    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      term.write(data);
    };

    ws.onclose = (event) => {
      term.write("\\r\\n\\x1b[33m[Terminal connection closed]\\x1b[0m\\r\\n");
    };

    ws.onerror = (error) => {
      term.write("\\r\\n\\x1b[31m[Terminal connection error]\\x1b[0m\\r\\n");
    };

    term.onData((data) => {"""

if target in text:
    with open("src/components/ContainerExec.tsx", "w") as f:
        f.write(text.replace(target, replace))
    print("Replaced successfully")
else:
    print("Not found")
