import "./style.css";
import { Game } from "./game/game";

const canvas = document.querySelector<HTMLCanvasElement>("#game");

if (!canvas) {
  throw new Error("No se encontró el canvas con id \"game\".");
}

const game = new Game(canvas);
game.start();
