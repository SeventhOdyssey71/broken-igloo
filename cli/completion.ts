// Generate shell completions for brokenigloo
import { BINARY_NAME } from "./branding.js";

const COMMANDS = ["ship", "init", "search", "repos", "skills", "doctor", "feedback", "uninstall", "completion"];

export function generateCompletion(shell: string): void {
  switch (shell) {
    case "bash":
      console.log(generateBashCompletion());
      break;
    case "zsh":
      console.log(generateZshCompletion());
      break;
    default:
      console.log(`Unsupported shell: ${shell}. Use 'bash' or 'zsh'.`);
      process.exit(1);
  }
}

function generateBashCompletion(): string {
  return `# brokenigloo bash completion
# Add to ~/.bashrc: eval "$(${BINARY_NAME} completion bash)"
_${BINARY_NAME}_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=( $(compgen -W "${COMMANDS.join(" ")} --help --version --agent" -- "\${cur}") )
}
complete -F _${BINARY_NAME}_completions ${BINARY_NAME}
complete -F _${BINARY_NAME}_completions sui-new
`;
}

function generateZshCompletion(): string {
  return `# brokenigloo zsh completion
# Add to ~/.zshrc: eval "$(${BINARY_NAME} completion zsh)"
_${BINARY_NAME}() {
  local -a commands
  commands=(
    'ship:Launch the interactive journey'
    'init:Install skills to AI assistants'
    'search:Search repos, skills, and MCPs'
    'repos:Browse clonable Sui repos'
    'skills:Browse installed skills'
    'doctor:Check development environment'
    'feedback:Send feedback'
    'uninstall:Remove installed skills'
    'completion:Generate shell completions'
  )
  _describe 'command' commands
}
compdef _${BINARY_NAME} ${BINARY_NAME}
compdef _${BINARY_NAME} sui-new
`;
}
