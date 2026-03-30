import re, glob

# For all TSX pages with tables:
files = glob.glob('src/pages/*.tsx')

for filepath in files:
    with open(filepath, 'r') as f:
        content = f.read()
    
    # 1. replace any "sticky right-0 ... bg-muted/20" on a td/th to just bg-card or bg-muted?
    # Actually, for the group header (which is slightly darker), if we make it solid, maybe bg-muted?
    content = re.sub(
        r'(<td[^>]*?className="sticky right-0[^"]*)bg-muted/20([^"]*")(.*?>)',
        r'\1bg-muted\2\3',
        content
    )

    # 2. replace group-hover:bg-muted/30 on sticky columns to group-hover:bg-muted
    # To be extremely targeted, we only replace group-hover:bg-muted/30 on lines that have "sticky right-0"
    content = re.sub(
        r'(<td[^>]*?className="sticky right-0[^"]*)group-hover:bg-muted/30([^"]*")(.*?>)',
        r'\1group-hover:bg-muted\2\3',
        content
    )

    with open(filepath, 'w') as f:
        f.write(content)
