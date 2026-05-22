# Claude Code & Antigravity Sync Rules

## ⚠️ CRITICAL COMMAND: OBSIDIAN VAULT SYNC
You MUST automatically update and sync the Obsidian Vault markdown files at `/Users/shubhammac/SSD/Obsidian/MedIQ/MedIQ/` at the end of EVERY TURN or TASK.

### Vault Files to Keep Synced:
1. `Active Session Context.md` -> Track active tasks, checklists, conversation ID, and session state.
2. `Active Database Config.md` -> Keep track of database projects, URL configuration, and region settings.
3. `Crawl and Ingestion Architecture.md` -> Keep track of the crawl sequences and ingestion mechanisms.
4. `Mediq Layout and Swarms.md` -> Document layout changes and swarm agent configs.
5. `Hobby Scale Database Split.md` -> Maintain RAG database split topology and architecture diagram.
6. `Clinical Swarm and AI Agents.md` -> Document active swarm models, specialty mappings, and cognitive strategies.
7. `Hospital and MBBS PG Mapping.md` -> Map hospital specialties to PG MBBS subjects and Swarm Agents.

## Build and Dev Commands
- **Run Dev Server**: `npm run dev` (Check active port; defaults to 3000, falls back to 3001 if occupied).
- **Run Typecheck**: `npm run typecheck`
- **Push Database Schema**: `npx drizzle-kit push`
