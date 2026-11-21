import 'package:flutter/material.dart';

import '../../core/categories.dart';
import '../../core/citizen_states.dart';
import '../../core/strings.dart';
import '../../core/theme.dart';
import 'explore_query.dart';

export 'explore_query.dart' show ReportFilters;

/// Bottom sheet over Explorar: search, category chips and state chips
/// (wireframe A3b). Returns the new filters, or null when dismissed.
class FiltersSheet extends StatefulWidget {
  const FiltersSheet({super.key, required this.initial});
  final ReportFilters initial;

  @override
  State<FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<FiltersSheet> {
  late String? _group = widget.initial.group;
  late String? _category = widget.initial.category;
  late final _query = TextEditingController(text: widget.initial.query);

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  void _close(ReportFilters filters) => Navigator.of(context).pop(filters);

  Widget _section(String title) => Padding(
    padding: const EdgeInsets.only(top: AldiaSpace.l, bottom: AldiaSpace.s),
    child: Semantics(
      header: true,
      child: Text(
        title.toUpperCase(),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          letterSpacing: 1.2,
        ),
      ),
    ),
  );

  Widget _chips<T>({
    required T? selected,
    required String allLabel,
    required Map<T, String> options,
    required ValueChanged<T?> onSelected,
  }) => Wrap(
    spacing: AldiaSpace.s,
    runSpacing: AldiaSpace.s,
    children: [
      FilterChip(
        label: Text(allLabel),
        selected: selected == null,
        onSelected: (_) => onSelected(null),
      ),
      for (final MapEntry(:key, :value) in options.entries)
        FilterChip(
          label: Text(value),
          selected: selected == key,
          onSelected: (_) => onSelected(key),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: EdgeInsets.fromLTRB(
          AldiaSpace.xl,
          AldiaSpace.s,
          AldiaSpace.xl,
          AldiaSpace.xl + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(S.filtersTitle, style: theme.textTheme.headlineSmall),
            ),
            const SizedBox(height: AldiaSpace.xs),
            Text(
              S.filtersHelp,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            _section(S.filterSearch),
            TextField(
              controller: _query,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _apply(),
              decoration: const InputDecoration(
                hintText: S.filterSearchHint,
                prefixIcon: Icon(Icons.search),
              ),
            ),
            _section(S.filterCategory),
            _chips<String>(
              selected: _category,
              allLabel: S.allCategoriesShort,
              options: {for (final c in reportCategories) c.id: c.label},
              onSelected: (value) => setState(() => _category = value),
            ),
            _section(S.filterState),
            _chips<String>(
              selected: _group,
              allLabel: S.allStatesShort,
              options: {
                for (final MapEntry(:key, :value) in stateGroups.entries)
                  key: value.$1,
              },
              onSelected: (value) => setState(() => _group = value),
            ),
            const SizedBox(height: AldiaSpace.xl),
            FilledButton(onPressed: _apply, child: const Text(S.applyFilters)),
            TextButton(
              onPressed: () => _close((group: null, category: null, query: '')),
              child: const Text(S.clearFilters),
            ),
          ],
        ),
      ),
    );
  }

  void _apply() =>
      _close((group: _group, category: _category, query: _query.text.trim()));
}
