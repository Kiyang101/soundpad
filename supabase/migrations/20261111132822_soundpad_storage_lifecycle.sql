create schema if not exists soundpad_private;

create function soundpad_private.require_live_sound()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sound_id uuid;
  object_folder text := split_part(new.name, '/', 1);
begin
  if new.bucket_id not in ('soundpad-sources', 'soundpad-clips') then
    return new;
  end if;

  if object_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid Soundpad object path' using errcode = '23514';
  end if;
  sound_id := object_folder::uuid;

  -- Serialize Storage finalization with the transition to deleting.
  perform 1 from public.sounds as sound
    where sound.id = sound_id and (
      (new.bucket_id = 'soundpad-sources' and sound.status = 'draft'
        and new.name = object_folder || '/original.' || sound.source_kind)
      or (new.bucket_id = 'soundpad-clips' and sound.status in ('draft', 'ready')
        and split_part(new.name, '/', 2) ~ '^[0-9a-f-]{36}[.]mp3$'
        and split_part(new.name, '/', 3) = '')
    )
    for share;

  if not found then
    raise exception 'Soundpad sound no longer accepts uploads' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function soundpad_private.require_live_sound() from public, anon, authenticated;

create trigger soundpad_require_live_sound
before insert or update of name, bucket_id on storage.objects
for each row execute function soundpad_private.require_live_sound();
