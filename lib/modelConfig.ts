export type ProviderModelOption = {
  id: string;
  name?: string;
  ownedBy?: string;
};

export type AvailableModelOptions = {
  all: ProviderModelOption[];
  text: ProviderModelOption[];
  image: ProviderModelOption[];
  video: ProviderModelOption[];
};

export type ModelLayer = 'text' | 'image' | 'video';

function hasModel(models: ProviderModelOption[], modelId: string) {
  return models.some((model) => model.id === modelId);
}

export function optionsForLayer(options: AvailableModelOptions, layer: ModelLayer) {
  return options[layer].length ? options[layer] : options.all;
}

export function pickLayerModel(current: string, preferred: ProviderModelOption[], all: ProviderModelOption[]) {
  const trimmed = current.trim();
  if (trimmed && hasModel(preferred, trimmed)) return trimmed;
  if (trimmed && !hasModel(all, trimmed)) return trimmed;
  return preferred[0]?.id || trimmed || all[0]?.id || '';
}

export function modelReadMessage(counts?: { all: number; text: number; image: number; video: number }) {
  if (!counts) return '已读取模型。';
  return `已读取 ${counts.all} 个模型：文本 ${counts.text} / 图片 ${counts.image} / 视频 ${counts.video}。`;
}
