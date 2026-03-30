import re

with open("src/pages/Containers.tsx", "r") as f:
    content = f.read()

# Fix Parent Row
parent_find = '''<td className="p-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup(entry.project)}
                            className="flex items-center gap-2 text-left"
                            aria-label={`${expandedGroups[entry.project] ? "Collapse" : "Expand"} compose stack ${entry.project}`}
                          >'''
parent_repl = '''<td className="p-3 relative">
                          {expandedGroups[entry.project] && (
                            <div className="absolute left-[20px] top-[31px] bottom-0 w-px bg-border/70 z-0" />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleGroup(entry.project)}
                            className="flex items-center gap-2 text-left relative z-10"
                            aria-label={`${expandedGroups[entry.project] ? "Collapse" : "Expand"} compose stack ${entry.project}`}
                          >'''

# Fix Child Loop Signature
child_loop_find = '''entry.containers.map((container) => ('''
child_loop_repl = '''entry.containers.map((container, index, arr) => ('''

# Fix Child Row
child_row_find = '''<td className="p-3">
                              <div className="flex items-start gap-2 pl-6">
                                <div className="mt-1 h-2 w-2 rounded-full border border-primary/60" />'''
child_row_repl = '''<td className="p-3 relative">
                              <div className="absolute left-[20px] top-0 h-[20px] w-px bg-border/70 z-0" />
                              {index !== arr.length - 1 && (
                                <div className="absolute left-[20px] top-[20px] bottom-0 w-px bg-border/70 z-0" />
                              )}
                              <div className="absolute left-[20px] top-[20px] w-4 h-px bg-border/70 z-0" />
                              <div className="flex items-start gap-2 pl-6 relative z-10">
                                <div className="mt-1 h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />'''

content = content.replace(parent_find, parent_repl)
content = content.replace(child_loop_find, child_loop_repl)
content = content.replace(child_row_find, child_row_repl)

with open("src/pages/Containers.tsx", "w") as f:
    f.write(content)

