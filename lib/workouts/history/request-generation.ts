export class WorkoutHistoryRequestGeneration {
  private value = 0;

  begin(): number {
    this.value += 1;
    return this.value;
  }

  current(): number {
    return this.value;
  }

  accepts(generation: number, signal: AbortSignal): boolean {
    return generation === this.value && !signal.aborted;
  }
}
