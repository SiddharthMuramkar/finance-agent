// Stand-in for @tanstack/react-table (see README.md). OpenUI's EditableTable is the only caller and is dropped from the Widget library.
export const createColumnHelper = () => ({ accessor: () => ({}) });
export const flexRender = () => null;
export const getCoreRowModel = () => () => ({});
export const useReactTable = () => ({ getHeaderGroups: () => [], getRowModel: () => ({ rows: [] }) });
