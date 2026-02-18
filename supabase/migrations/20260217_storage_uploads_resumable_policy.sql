-- Allow authenticated resumable uploads to storage.objects in uploads bucket,
-- scoped to objects under "<auth.uid()>/..."

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'uploads_select_own'
  ) then
    create policy "uploads_select_own"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'uploads'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'uploads_insert_own'
  ) then
    create policy "uploads_insert_own"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'uploads'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'uploads_update_own'
  ) then
    create policy "uploads_update_own"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'uploads'
        and split_part(name, '/', 1) = auth.uid()::text
      )
      with check (
        bucket_id = 'uploads'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'uploads_delete_own'
  ) then
    create policy "uploads_delete_own"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'uploads'
        and split_part(name, '/', 1) = auth.uid()::text
      );
  end if;
end
$$;
