<svelte:options
	customElement={{
		tag: 'nostr-embed',
		props: {
			noteId: { attribute: 'note-id' }
		}
	}}
/>

<script>
  import { onMount } from 'svelte';
  import { SimplePool } from 'nostr-tools/pool'

  export let noteId; // Accept noteId as a prop

  let nostrEvent = null;
  let error = null;


  async function getNote(realNoteId) {
    const pool = new SimplePool();
    let relays = ['wss://relay.damus.io', 'wss://nostr.mom/'];
    nostrEvent = await pool.get(relays, {
      ids: [realNoteId],
    });
    //console.log(nostrEvent);
  }


  if (noteId) {
    getNote(noteId);
    } else {
      error = 'Note ID not passed.';
    }

</script>

<!-- Component Template -->
{#if error}
  <p style="color: red;">{error}</p>
{:else if nostrEvent}
  <pre><code>{JSON.stringify(nostrEvent, null, 2)}</code></pre>
{:else}
  <p>Loading...</p>
{/if}