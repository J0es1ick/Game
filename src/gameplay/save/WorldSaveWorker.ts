import {
  createWorldSavePreparer,
  type WorldSavePreparationRequest,
  type WorldSavePreparationResponse,
} from "./WorldSavePreparation";

const worker = globalThis as unknown as {
  onmessage:
    ((event: MessageEvent<WorldSavePreparationRequest>) => void) | null;
  postMessage: (response: WorldSavePreparationResponse) => void;
};
const prepare = createWorldSavePreparer();
worker.onmessage = (event) => worker.postMessage(prepare(event.data));
