import { randomUUID } from "node:crypto";
import {
  applyContentPoolCollectionMembershipChangesFromDb,
  countContentPoolCollectionItemsByCollectionFromDb,
  deleteContentPoolCollectionFromDb,
  deleteContentPoolTagFromDb,
  getContentPoolItemOwnersByIdsFromDb,
  listContentPoolCollectionItemsForItemIdsFromDb,
  listContentPoolCollectionsFromDb,
  listContentPoolTagsFromDb,
  mutateAllSourceProjectsInDb,
  saveContentPoolCollectionToDb,
  saveContentPoolTagToDb,
  type ContentPoolItemOwnerRef,
} from "./database";
import { contentPoolCollectionDescendantIds } from "./content-pool-selection";
import { contentPoolCustomTagKey, normalizeContentPoolCustomTags, normalizeContentPoolTagColor } from "./content-pool-tags";
import { canAccessWorkspaceOwner, scopeWorkspaceOwner, type WorkspaceAccessActor } from "./workspace-ownership";
import type {
  ContentPoolCollection,
  ContentPoolCollectionBatchFailure,
  ContentPoolCollectionBatchRequest,
  ContentPoolCollectionBatchResult,
  ContentPoolTag,
  ContentPoolTagColor,
} from "./types";

const contentPoolCollectionNameLimit = 120;

export class ContentPoolCollectionValidationError extends Error {}

export function normalizeContentPoolCollectionName(value: unknown) {
  const name = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[/\\]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!name) throw new ContentPoolCollectionValidationError("内容库名称不能为空。");
  return Array.from(name).slice(0, contentPoolCollectionNameLimit).join("");
}

export async function listContentPoolCollections(account: WorkspaceAccessActor): Promise<ContentPoolCollection[]> {
  const [collections, groupedCounts] = await Promise.all([
    listContentPoolCollectionsFromDb(),
    countContentPoolCollectionItemsByCollectionFromDb(),
  ]);
  const counts = new Map(groupedCounts.map((entry) => [entry.collectionId, entry.count]));
  return collections
    .filter((collection) => canAccessWorkspaceOwner(account, collection.ownerUserId))
    .map((collection) => ({
      ...collection,
      itemCount: counts.get(collection.id) || 0,
      canEdit: canAccessWorkspaceOwner(account, collection.ownerUserId),
    }))
    .sort(compareCollections);
}

export async function createContentPoolCollection(
  account: WorkspaceAccessActor,
  input: { name: unknown; parentId?: unknown },
): Promise<ContentPoolCollection> {
  const name = normalizeContentPoolCollectionName(input.name);
  const parentId = cleanString(input.parentId);
  const collections = await listContentPoolCollectionsFromDb();
  const parent = parentId ? collections.find((collection) => collection.id === parentId) : undefined;
  if (parentId && (!parent || !canAccessWorkspaceOwner(account, parent.ownerUserId))) {
    throw new ContentPoolCollectionValidationError("父级内容库不存在或无权编辑。");
  }
  const owner = parent
    ? { ownerUserId: parent.ownerUserId, ownerDisplayName: parent.ownerDisplayName }
    : scopeWorkspaceOwner(account);
  const relativePath = parent?.relativePath ? `${parent.relativePath}/${name}` : name;
  const existing = collections.find((collection) => collection.ownerUserId === owner.ownerUserId && collection.relativePath === relativePath);
  if (existing) return collectionView(existing, account);
  const now = new Date().toISOString();
  const collection: ContentPoolCollection = {
    id: `content-pool-collection-${randomUUID()}`,
    ...owner,
    name,
    parentId: parent?.id,
    relativePath,
    itemCount: 0,
    canEdit: true,
    createdAt: now,
    updatedAt: now,
  };
  await saveContentPoolCollectionToDb(collection);
  return collection;
}

export async function updateContentPoolCollection(
  account: WorkspaceAccessActor,
  collectionId: string,
  input: { name?: unknown; parentId?: unknown },
): Promise<ContentPoolCollection> {
  const collections = await listContentPoolCollectionsFromDb();
  const collection = collections.find((candidate) => candidate.id === collectionId);
  if (!collection || !canAccessWorkspaceOwner(account, collection.ownerUserId)) {
    throw new ContentPoolCollectionValidationError("内容库不存在或无权编辑。");
  }
  let parentId = collection.parentId;
  if (input.parentId !== undefined) {
    parentId = cleanString(input.parentId) || undefined;
    if (parentId === collectionId) throw new ContentPoolCollectionValidationError("内容库不能作为自己的子集。");
    if (parentId) {
      const parent = collections.find((candidate) => candidate.id === parentId);
      if (!parent || !canAccessWorkspaceOwner(account, parent.ownerUserId) || parent.ownerUserId !== collection.ownerUserId) {
        throw new ContentPoolCollectionValidationError("父级内容库不存在或无权编辑。");
      }
      if (contentPoolCollectionDescendantIds(collections, collectionId).includes(parentId)) {
        throw new ContentPoolCollectionValidationError("内容库不能移动到自己的子集下。");
      }
    }
  }
  const name = input.name === undefined ? collection.name : normalizeContentPoolCollectionName(input.name);
  const parent = parentId ? collections.find((candidate) => candidate.id === parentId) : undefined;
  const now = new Date().toISOString();
  const next: ContentPoolCollection = {
    ...collection,
    name,
    parentId: parent?.id,
    relativePath: parent?.relativePath ? `${parent.relativePath}/${name}` : name,
    updatedAt: now,
  };
  await saveContentPoolCollectionToDb(next);
  await refreshContentPoolCollectionPaths(collections.map((candidate) => candidate.id === next.id ? next : candidate), next.id);
  return collectionView(next, account);
}

export async function deleteContentPoolCollection(account: WorkspaceAccessActor, collectionId: string) {
  const collections = await listContentPoolCollectionsFromDb();
  const collection = collections.find((candidate) => candidate.id === collectionId);
  if (!collection || !canAccessWorkspaceOwner(account, collection.ownerUserId)) {
    throw new ContentPoolCollectionValidationError("内容库不存在或无权编辑。");
  }
  const now = new Date().toISOString();
  const nextCollections = collections.map((candidate) => candidate.parentId === collectionId
    ? { ...candidate, parentId: collection.parentId, updatedAt: now }
    : candidate);
  const paths = rebuildCollectionPaths(nextCollections);
  for (const candidate of paths) {
    const previous = collections.find((item) => item.id === candidate.id);
    if (!previous || previous.relativePath !== candidate.relativePath || previous.parentId !== candidate.parentId) {
      await saveContentPoolCollectionToDb(candidate);
    }
  }
  await deleteContentPoolCollectionFromDb(collectionId);
  return { deleted: true, collectionId };
}

export async function updateContentPoolCollectionItems(
  account: WorkspaceAccessActor,
  request: ContentPoolCollectionBatchRequest,
): Promise<ContentPoolCollectionBatchResult> {
  const itemIds = uniqueStrings(request.itemIds);
  if (!itemIds.length) throw new ContentPoolCollectionValidationError("请选择至少一条内容。");
  const [itemOwners, collections, currentMemberships] = await Promise.all([
    getContentPoolItemOwnersByIdsFromDb(itemIds),
    listContentPoolCollectionsFromDb(),
    listContentPoolCollectionItemsForItemIdsFromDb(itemIds),
  ]);
  const itemLookup = new Map(itemOwners.map((item) => [item.id, item]));
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  const failures: ContentPoolCollectionBatchFailure[] = [];
  const unchangedItemIds: string[] = [];
  const additions: Array<{ collectionId: string; itemId: string }> = [];
  const removals: Array<{ collectionId: string; itemId: string }> = [];
  const currentKeys = new Set(currentMemberships.map((membership) => membershipKey(membership.collectionId, membership.itemId)));
  const itemMatchesCollection = (item: ContentPoolItemOwnerRef, collection: ContentPoolCollection) => !item.ownerUserId || item.ownerUserId === collection.ownerUserId;
  const requireCollection = (collectionId: string) => {
    const collection = collectionById.get(collectionId);
    if (!collection || !canAccessWorkspaceOwner(account, collection.ownerUserId)) {
      throw new ContentPoolCollectionValidationError("目标内容库不存在或无权编辑。");
    }
    return collection;
  };
  let createdCollection: ContentPoolCollection | undefined;

  if (request.action === "add_to_collections") {
    const targetCollections = uniqueStrings(request.collectionIds).map(requireCollection);
    if (!targetCollections.length) throw new ContentPoolCollectionValidationError("请选择至少一个目标内容库。");
    for (const itemId of itemIds) {
      const item = itemLookup.get(itemId);
      if (!item || !canMutateContentPoolItem(account, item)) {
        failures.push({ itemId, error: "内容不存在或无权编辑。" });
        continue;
      }
      let changed = false;
      for (const collection of targetCollections) {
        if (!itemMatchesCollection(item, collection)) {
          failures.push({ itemId, error: `内容与内容库“${collection.relativePath || collection.name}”不属于同一账号。` });
          continue;
        }
        const key = membershipKey(collection.id, item.id);
        if (currentKeys.has(key)) continue;
        currentKeys.add(key);
        additions.push({ collectionId: collection.id, itemId: item.id });
        changed = true;
      }
      if (!changed) unchangedItemIds.push(itemId);
    }
  } else if (request.action === "move_to_collection") {
    const source = requireCollection(cleanString(request.sourceCollectionId));
    const target = requireCollection(cleanString(request.targetCollectionId));
    if (source.id === target.id) throw new ContentPoolCollectionValidationError("目标内容库不能与来源相同。");
    for (const itemId of itemIds) {
      const item = itemLookup.get(itemId);
      if (!item || !canMutateContentPoolItem(account, item)) {
        failures.push({ itemId, error: "内容不存在或无权编辑。" });
        continue;
      }
      if (!itemMatchesCollection(item, target)) {
        failures.push({ itemId, error: `内容与内容库“${target.relativePath || target.name}”不属于同一账号。` });
        continue;
      }
      const sourceKey = membershipKey(source.id, item.id);
      const targetKey = membershipKey(target.id, item.id);
      let changed = false;
      if (currentKeys.has(sourceKey)) {
        currentKeys.delete(sourceKey);
        removals.push({ collectionId: source.id, itemId: item.id });
        changed = true;
      }
      if (!currentKeys.has(targetKey)) {
        currentKeys.add(targetKey);
        additions.push({ collectionId: target.id, itemId: item.id });
        changed = true;
      }
      if (!changed) unchangedItemIds.push(itemId);
    }
  } else if (request.action === "remove_from_collection") {
    const collection = requireCollection(cleanString(request.collectionId));
    for (const itemId of itemIds) {
      const item = itemLookup.get(itemId);
      if (!item || !canMutateContentPoolItem(account, item)) {
        failures.push({ itemId, error: "内容不存在或无权编辑。" });
        continue;
      }
      const key = membershipKey(collection.id, item.id);
      if (!currentKeys.has(key)) {
        unchangedItemIds.push(itemId);
        continue;
      }
      currentKeys.delete(key);
      removals.push({ collectionId: collection.id, itemId: item.id });
    }
  } else if (request.action === "move_to_default") {
    for (const itemId of itemIds) {
      const item = itemLookup.get(itemId);
      if (!item || !canMutateContentPoolItem(account, item)) {
        failures.push({ itemId, error: "内容不存在或无权编辑。" });
        continue;
      }
      const memberships = currentMemberships.filter((membership) => membership.itemId === item.id
        && collectionById.has(membership.collectionId)
        && canAccessWorkspaceOwner(account, collectionById.get(membership.collectionId)?.ownerUserId));
      if (!memberships.length) {
        unchangedItemIds.push(itemId);
        continue;
      }
      for (const membership of memberships) {
        if (!currentKeys.has(membershipKey(membership.collectionId, membership.itemId))) continue;
        currentKeys.delete(membershipKey(membership.collectionId, membership.itemId));
        removals.push({ collectionId: membership.collectionId, itemId: membership.itemId });
      }
    }
  } else {
    const name = normalizeContentPoolCollectionName(request.name);
    const parentId = cleanString(request.parentId);
    const parent = parentId ? requireCollection(parentId) : undefined;
    const owner = parent
      ? { ownerUserId: parent.ownerUserId, ownerDisplayName: parent.ownerDisplayName }
      : scopeWorkspaceOwner(account);
    createdCollection = await createContentPoolCollection(account, { name, parentId: parent?.id });
    for (const itemId of itemIds) {
      const item = itemLookup.get(itemId);
      if (!item || !canMutateContentPoolItem(account, item)) {
        failures.push({ itemId, error: "内容不存在或无权编辑。" });
        continue;
      }
      if (item.ownerUserId && item.ownerUserId !== owner.ownerUserId) {
        failures.push({ itemId, error: "内容与新建内容库不属于同一账号。" });
        continue;
      }
      const key = membershipKey(createdCollection.id, item.id);
      if (currentKeys.has(key)) {
        unchangedItemIds.push(itemId);
        continue;
      }
      currentKeys.add(key);
      additions.push({ collectionId: createdCollection.id, itemId: item.id });
    }
  }

  if (additions.length || removals.length) {
    await applyContentPoolCollectionMembershipChangesFromDb({ additions, removals, clearItems: [], createdAt: new Date().toISOString() });
  }
  const memberships = await listContentPoolCollectionItemsForItemIdsFromDb(itemIds);
  return {
    action: request.action,
    collection: createdCollection ? collectionView(createdCollection, account) : undefined,
    memberships,
    unchangedItemIds,
    failures,
  };
}

export async function assertContentPoolCollectionTarget(account: WorkspaceAccessActor, collectionId: string) {
  const collections = await listContentPoolCollectionsFromDb();
  const collection = collections.find((candidate) => candidate.id === collectionId);
  if (!collection || !canAccessWorkspaceOwner(account, collection.ownerUserId)) {
    throw new ContentPoolCollectionValidationError("目标内容库不存在或无权编辑。");
  }
  return collection;
}

export async function requireContentPoolCollectionWriteTarget(account: WorkspaceAccessActor, collectionId: string) {
  const collection = await assertContentPoolCollectionTarget(account, collectionId);
  const owner = scopeWorkspaceOwner(account);
  if (collection.ownerUserId !== owner.ownerUserId) {
    throw new ContentPoolCollectionValidationError("只能采集到当前账号自己的内容库。");
  }
  return collection;
}

export async function renameContentPoolTag(account: WorkspaceAccessActor, input: { from: unknown; to: unknown }) {
  const from = normalizeTagLabel(input.from);
  const to = normalizeTagLabel(input.to);
  const fromKey = contentPoolCustomTagKey(from);
  const toKey = contentPoolCustomTagKey(to);
  const affectedItemIds = new Set<string>();
  await mutateAllSourceProjectsInDb((project) => {
    let changed = false;
    const now = new Date().toISOString();
    const items = project.items.map((item) => {
      if (!canMutateContentPoolItem(account, item)) return item;
      const tags = normalizeContentPoolCustomTags(item.customTags);
      if (!tags.some((tag) => contentPoolCustomTagKey(tag) === fromKey)) return item;
      const nextTags = normalizeContentPoolCustomTags(tags.map((tag) => contentPoolCustomTagKey(tag) === fromKey ? to : tag));
      if (sameStringList(tags, nextTags)) return item;
      changed = true;
      affectedItemIds.add(item.id);
      return { ...item, customTags: nextTags };
    });
    return changed ? { ...project, items, updatedAt: now } : undefined;
  });
  const owner = scopeWorkspaceOwner(account);
  const tags = await listContentPoolTagsFromDb();
  const source = tags.find((tag) => tag.ownerUserId === owner.ownerUserId && tag.tagKey === fromKey);
  const target = tags.find((tag) => tag.ownerUserId === owner.ownerUserId && tag.tagKey === toKey);
  const now = new Date().toISOString();
  const nextTag: ContentPoolTag = {
    id: target?.id || source?.id || `content-pool-tag-${randomUUID()}`,
    ownerUserId: owner.ownerUserId,
    tagKey: toKey,
    label: to,
    color: target?.color || source?.color || "",
    createdAt: target?.createdAt || source?.createdAt || now,
    updatedAt: now,
  };
  await saveContentPoolTagToDb(nextTag);
  if (source && fromKey !== toKey) await deleteContentPoolTagFromDb(owner.ownerUserId, fromKey);
  return { affectedItems: affectedItemIds.size, tag: nextTag };
}

export async function mergeContentPoolTags(account: WorkspaceAccessActor, input: { from: unknown; to: unknown }) {
  return renameContentPoolTag(account, input);
}

export async function deleteContentPoolTag(account: WorkspaceAccessActor, input: { label: unknown }) {
  const label = normalizeTagLabel(input.label);
  const labelKey = contentPoolCustomTagKey(label);
  const affectedItemIds = new Set<string>();
  await mutateAllSourceProjectsInDb((project) => {
    let changed = false;
    const now = new Date().toISOString();
    const items = project.items.map((item) => {
      if (!canMutateContentPoolItem(account, item)) return item;
      const tags = normalizeContentPoolCustomTags(item.customTags);
      if (!tags.some((tag) => contentPoolCustomTagKey(tag) === labelKey)) return item;
      const nextTags = tags.filter((tag) => contentPoolCustomTagKey(tag) !== labelKey);
      changed = true;
      affectedItemIds.add(item.id);
      return { ...item, customTags: nextTags };
    });
    return changed ? { ...project, items, updatedAt: now } : undefined;
  });
  const owner = scopeWorkspaceOwner(account);
  await deleteContentPoolTagFromDb(owner.ownerUserId, labelKey);
  return { affectedItems: affectedItemIds.size };
}

export async function setContentPoolTagColor(account: WorkspaceAccessActor, input: { label: unknown; color: unknown }) {
  const label = normalizeTagLabel(input.label);
  const color = input.color === "" || input.color === undefined || input.color === null
    ? ""
    : normalizeContentPoolTagColor(input.color);
  if (input.color !== "" && input.color !== undefined && input.color !== null && !color) {
    throw new ContentPoolCollectionValidationError("标签颜色不受支持。");
  }
  const owner = scopeWorkspaceOwner(account);
  const tagKey = contentPoolCustomTagKey(label);
  const tags = await listContentPoolTagsFromDb();
  const existing = tags.find((tag) => tag.ownerUserId === owner.ownerUserId && tag.tagKey === tagKey);
  const now = new Date().toISOString();
  const tag: ContentPoolTag = {
    id: existing?.id || `content-pool-tag-${randomUUID()}`,
    ownerUserId: owner.ownerUserId,
    tagKey,
    label,
    color: color || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  await saveContentPoolTagToDb(tag);
  return { tag };
}

export function contentPoolTagColorMap(tags: ContentPoolTag[], ownerUserId?: string) {
  const colors = new Map<string, ContentPoolTagColor>();
  for (const tag of tags) {
    if (ownerUserId && tag.ownerUserId !== ownerUserId) continue;
    if (tag.color) colors.set(tag.tagKey, tag.color);
  }
  return colors;
}

function normalizeTagLabel(value: unknown) {
  if (typeof value !== "string") throw new ContentPoolCollectionValidationError("标签不能为空。");
  const label = normalizeContentPoolCustomTags([value])[0];
  if (!label) throw new ContentPoolCollectionValidationError("标签不能为空。");
  return label;
}

async function refreshContentPoolCollectionPaths(collections: ContentPoolCollection[], rootId: string) {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const payload = (collection: ContentPoolCollection) => {
    const parent = collection.parentId ? byId.get(collection.parentId) : undefined;
    return parent?.relativePath ? `${parent.relativePath}/${collection.name}` : collection.name;
  };
  const visit = async (parentId: string) => {
    for (const collection of collections.filter((candidate) => candidate.parentId === parentId)) {
      const relativePath = payload(collection);
      if (collection.relativePath !== relativePath) {
        const next = { ...collection, relativePath, updatedAt: new Date().toISOString() };
        byId.set(next.id, next);
        await saveContentPoolCollectionToDb(next);
      }
      await visit(collection.id);
    }
  };
  await visit(rootId);
}

function rebuildCollectionPaths(collections: ContentPoolCollection[]) {
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const resolve = (collection: ContentPoolCollection, seen = new Set<string>()): string => {
    if (!collection.parentId || seen.has(collection.id)) return collection.name;
    seen.add(collection.id);
    const parent = byId.get(collection.parentId);
    return parent ? `${resolve(parent, seen)}/${collection.name}` : collection.name;
  };
  return collections.map((collection) => ({ ...collection, relativePath: resolve(collection) }));
}

function collectionView(collection: ContentPoolCollection, account: WorkspaceAccessActor): ContentPoolCollection {
  return { ...collection, canEdit: canAccessWorkspaceOwner(account, collection.ownerUserId) };
}

function compareCollections(left: ContentPoolCollection, right: ContentPoolCollection) {
  return (left.relativePath || left.name).localeCompare(right.relativePath || right.name, "zh-CN") || left.id.localeCompare(right.id);
}

function canMutateContentPoolItem(account: WorkspaceAccessActor, item: ContentPoolItemOwnerRef) {
  return canAccessWorkspaceOwner(account, item.ownerUserId);
}

function membershipKey(collectionId: string, itemId: string) {
  return `${collectionId}\u0000${itemId}`;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: unknown) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(cleanString).filter(Boolean)));
}

function sameStringList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
