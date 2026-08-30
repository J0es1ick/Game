import { Component, type ReactNode } from "react";
import { SaveRecovery } from "../../features/onboarding/ModeScreens/ModeScreens";
import type { GameStore } from "../state/GameStore";

export class AppErrorBoundary extends Component<
  { children: ReactNode; store: GameStore },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  private generation = this.props.store.getGeneration();
  private unsubscribe?: () => void;

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidMount() {
    const recover = () => {
      const generation = this.props.store.getGeneration();
      if (generation === this.generation) return;
      this.generation = generation;
      if (this.state.error) this.setState({ error: null });
    };
    const unsubscribeGame = this.props.store.subscribe(recover);
    const unsubscribeApp = this.props.store.subscribeApp(recover);
    this.unsubscribe = () => {
      unsubscribeGame();
      unsubscribeApp();
    };
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    if (this.state.error)
      return (
        <SaveRecovery
          error={`Не удалось открыть интерфейс: ${this.state.error.message}. Сохранение остаётся на месте.`}
        />
      );
    return this.props.children;
  }
}
