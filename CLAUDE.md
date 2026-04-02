# whoop-coach

A Python app that connects to the WHOOP API to pull workout data, stores it in SQLite, and generates progressive overload workouts for push/pull/legs/arms splits.

## Key Commands

```bash
python src/sync.py              # Pull WHOOP data
python src/generate_workout.py  # Generate next workout
python -m pytest                # Run tests
```

## Coding Rules

- Always use type hints on all functions and methods
- Write docstrings on every function
- Never hardcode credentials — always use `.env` (loaded via `python-dotenv`)
- Use Python `logging` module, never `print()`
