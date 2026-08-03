export type WorkoutHistoryCoordinatedResult<T> = {
  key: string;
  generation: number;
  value: T;
};

type ActiveRequest<T> = {
  key: string;
  generation: number;
  controller: AbortController;
  promise: Promise<WorkoutHistoryCoordinatedResult<T>>;
};

type LoadedRequest<T> = {
  key: string;
  result: WorkoutHistoryCoordinatedResult<T>;
};

export class WorkoutHistoryFirstPageRequestCoordinator<T> {
  private generation = 0;
  private currentKey: string | null = null;
  private active: ActiveRequest<T> | null = null;
  private loaded: LoadedRequest<T> | null = null;

  load(
    key: string,
    loader: (signal: AbortSignal) => Promise<T>,
    options: { force?: boolean } = {},
  ): Promise<WorkoutHistoryCoordinatedResult<T>> {
    if (this.active?.key === key) {
      return this.active.promise;
    }

    if (
      !options.force &&
      this.currentKey === key &&
      this.loaded?.key === key
    ) {
      return Promise.resolve(this.loaded.result);
    }

    this.active?.controller.abort();
    this.generation += 1;
    const generation = this.generation;
    this.currentKey = key;
    this.loaded = null;

    const controller = new AbortController();
    const promise = Promise.resolve()
      .then(() => loader(controller.signal))
      .then((value) => {
        const result = { key, generation, value };
        if (this.accepts(result) && !controller.signal.aborted) {
          this.loaded = { key, result };
        }
        return result;
      })
      .finally(() => {
        if (this.active?.promise === promise) {
          this.active = null;
        }
      });

    this.active = { key, generation, controller, promise };
    return promise;
  }

  accepts(result: Pick<WorkoutHistoryCoordinatedResult<T>, "key" | "generation">) {
    return (
      this.currentKey === result.key &&
      this.generation === result.generation
    );
  }

  isCurrentKey(key: string) {
    return this.currentKey === key;
  }

  invalidate() {
    this.active?.controller.abort();
    this.active = null;
    this.loaded = null;
    this.currentKey = null;
    this.generation += 1;
  }

  dispose() {
    this.invalidate();
  }
}
