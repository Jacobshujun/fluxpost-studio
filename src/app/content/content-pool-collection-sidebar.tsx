"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Inbox,
  Layers3,
  Pencil,
  Plus,
  Search,
  Settings2,
  Tag,
  Trash2,
} from "lucide-react";
import { contentPoolTagColorHex } from "@/lib/content-pool-tags";
import type { ContentPoolCollection, ContentPoolTagSuggestion } from "@/lib/types";

export type ContentPoolLibraryView =
  | { kind: "all" }
  | { kind: "default" }
  | { kind: "collection"; id: string };

type CollectionSidebarProps = {
  collections: ContentPoolCollection[];
  view: ContentPoolLibraryView;
  counts: { all: number; default: number; byCollection: Record<string, number> };
  tags: ContentPoolTagSuggestion[];
  open: boolean;
  onSelectView: (view: ContentPoolLibraryView) => void;
  onCreateRoot: () => void;
  onCreateChild: (collection: ContentPoolCollection) => void;
  onRename: (collection: ContentPoolCollection) => void;
  onDelete: (collection: ContentPoolCollection) => void;
  onManageTags: () => void;
  onTagClick: (label: string) => void;
};

export function ContentPoolCollectionSidebar({
  collections,
  view,
  counts,
  tags,
  open,
  onSelectView,
  onCreateRoot,
  onCreateChild,
  onRename,
  onDelete,
  onManageTags,
  onTagClick,
}: CollectionSidebarProps) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const activeCollectionId = view.kind === "collection" ? view.id : undefined;
  const searchTerm = search.normalize("NFKC").trim().toLocaleLowerCase();
  const collectionIds = useMemo(() => new Set(collections.map((collection) => collection.id)), [collections]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ContentPoolCollection[]>();
    for (const collection of collections) {
      const parentId = collection.parentId && collectionIds.has(collection.parentId) ? collection.parentId : "";
      const children = map.get(parentId) || [];
      children.push(collection);
      map.set(parentId, children);
    }
    for (const children of map.values()) children.sort(compareCollections);
    return map;
  }, [collectionIds, collections]);
  const visibleIds = useMemo(() => {
    if (!searchTerm) return null;
    const byId = new Map(collections.map((collection) => [collection.id, collection]));
    const visible = new Set<string>();
    for (const collection of collections) {
      if (!`${collection.name} ${collection.relativePath || ""}`.normalize("NFKC").toLocaleLowerCase().includes(searchTerm)) continue;
      visible.add(collection.id);
      let parentId = collection.parentId;
      while (parentId && byId.has(parentId)) {
        visible.add(parentId);
        parentId = byId.get(parentId)?.parentId;
      }
    }
    return visible;
  }, [collections, searchTerm]);

  function toggleCollapsed(collectionId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  }

  function renderCollection(collection: ContentPoolCollection, depth: number) {
    if (visibleIds && !visibleIds.has(collection.id)) return null;
    const children = childrenByParent.get(collection.id) || [];
    const isCollapsed = !searchTerm && collapsed.has(collection.id);
    return (
      <div key={collection.id}>
        <div
          className={`content-pool-library-row ${activeCollectionId === collection.id ? "is-active" : ""}`}
          style={{ paddingLeft: `${6 + Math.min(depth, 8) * 14}px` }}
        >
          {children.length ? (
            <button
              className="content-pool-library-chevron"
              type="button"
              aria-label={`${isCollapsed ? "展开" : "折叠"}${collection.name}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(collection.id)}
            >
              {isCollapsed ? <ChevronRight /> : <ChevronDown />}
            </button>
          ) : <span className="content-pool-library-chevron-spacer" />}
          <button
            className="content-pool-library-item"
            type="button"
            title={collection.relativePath || collection.name}
            onClick={() => onSelectView({ kind: "collection", id: collection.id })}
          >
            <Folder />
            <span>{collection.name}</span>
            <small>{counts.byCollection[collection.id] || 0}</small>
          </button>
          {collection.canEdit ? (
            <span className="content-pool-library-actions">
              <button type="button" title={`在“${collection.name}”下新建子集`} aria-label={`在“${collection.name}”下新建子集`} onClick={() => onCreateChild(collection)}><Plus /></button>
              <button type="button" title={`重命名“${collection.name}”`} aria-label={`重命名“${collection.name}”`} onClick={() => onRename(collection)}><Pencil /></button>
              <button type="button" title={`删除“${collection.name}”`} aria-label={`删除“${collection.name}”`} onClick={() => onDelete(collection)}><Trash2 /></button>
            </span>
          ) : null}
        </div>
        {!isCollapsed ? children.map((child) => renderCollection(child, depth + 1)) : null}
      </div>
    );
  }

  const roots = childrenByParent.get("") || [];

  return (
    <aside className="content-desk-pane content-desk-library glass ops-panel thin-scrollbar" data-open={open ? "true" : "false"} aria-label="内容库导航">
      <div className="content-pool-library-header">
        <div className="min-w-0">
          <p className="content-pool-library-title">内容库</p>
          <small>{collections.length ? `${collections.length} 个库/子集` : "整理采集素材"}</small>
        </div>
        <button className="soft-button grid h-8 w-8 place-items-center" type="button" title="新建内容库" aria-label="新建内容库" onClick={onCreateRoot}>
          <Plus />
        </button>
      </div>

      <div className="content-pool-library-system">
        <button className={view.kind === "all" ? "is-active" : ""} type="button" onClick={() => onSelectView({ kind: "all" })}>
          <Layers3 /><span>全部内容</span><small>{counts.all}</small>
        </button>
        <button className={view.kind === "default" ? "is-active" : ""} type="button" onClick={() => onSelectView({ kind: "default" })}>
          <Inbox /><span>默认库</span><small>{counts.default}</small>
        </button>
      </div>

      <label className="content-pool-library-search">
        <Search />
        <input aria-label="搜索内容库" placeholder="搜索内容库" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      <div className="content-pool-library-tree">
        {roots.length ? roots.map((collection) => renderCollection(collection, 0)) : <p className="content-pool-library-empty">还没有内容库，点右上角 + 新建。</p>}
        {searchTerm && visibleIds && !visibleIds.size ? <p className="content-pool-library-empty">没有匹配的内容库。</p> : null}
      </div>

      <div className="content-pool-library-tags">
        <div className="content-pool-library-section-head">
          <span><Tag />标签</span>
          <button type="button" onClick={onManageTags}><Settings2 />管理</button>
        </div>
        {tags.length ? (
          <div className="content-pool-library-tag-list">
            {tags.slice(0, 12).map((tag) => (
              <button key={tag.key} type="button" onClick={() => onTagClick(tag.label)}>
                <i style={{ background: contentPoolTagColorHex[tag.color] }} />
                <span>{tag.label}</span>
                <small>{tag.count}</small>
              </button>
            ))}
          </div>
        ) : <p className="content-pool-library-empty">暂无自定义标签。</p>}
      </div>
    </aside>
  );
}

function compareCollections(left: ContentPoolCollection, right: ContentPoolCollection) {
  return (left.relativePath || left.name).localeCompare(right.relativePath || right.name, "zh-CN") || left.id.localeCompare(right.id);
}
