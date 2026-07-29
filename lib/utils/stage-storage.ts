export interface StageStorageData {
  stage: import('@/lib/types/stage').Stage;
  scenes: import('@/lib/types/stage').Scene[];
  currentSceneId: string | null;
  chats: import('@/lib/types/chat').ChatSession[];
}

export async function saveStageData(_stageId: string, _data: StageStorageData): Promise<void> {
  // Stub: no-op
}

export async function loadStageData(_stageId: string): Promise<StageStorageData | null> {
  // Stub: returns null
  return null;
}
