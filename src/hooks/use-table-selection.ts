import { useEffect, useMemo, useState } from "react";

export function useTableSelection(ids: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const validIds = useMemo(() => new Set(ids), [ids]);

  useEffect(() => {
    setSelectedIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [validIds]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIdSet.has(id));
  const partiallySelected = !allSelected && ids.some((id) => selectedIdSet.has(id));

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? ids : []);
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }

      return current.filter((currentId) => currentId !== id);
    });
  };

  return {
    allSelected,
    partiallySelected,
    selectedIds,
    selectedCount: selectedIds.length,
    toggleAll,
    toggleOne,
  };
}
