<svelte:options
	customElement={{
		tag: 'nostr-embed',
		props: {
			noteId: { attribute: 'note-id' },
      recursive: { attribute: 'recursive' }
		}
	}}
/>

<style>
  
  nostr-embed-wrap {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: flex-start;
    width: 55%;
    max-width: 970px;
    border: 2px lightgray solid;
    border-radius: 15px;
    padding: 15px;
    background-color: #FFF;
    background-image: url("data:image/svg+xml;charset=utf-8,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20width%3D%228.5287mm%22%20height%3D%228.5287mm%22%20version%3D%221.1%22%20viewBox%3D%220%200%208.5287%208.5287%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cg%20transform%3D%22translate(-104.04%20-19.711)%22%3E%0A%3Cg%20transform%3D%22translate(13.335%20-.25768)%22%20stroke-width%3D%22.041341%22%3E%0A%3Ccircle%20class%3D%22st1%22%20cx%3D%2295.374%22%20cy%3D%2223.032%22%20r%3D%22.50023%22%20fill%3D%22%23fff%22%2F%3E%0A%3Cpath%20class%3D%22st1%22%20d%3D%22m98.388%2023.731c0-1.9554-1.1451-2.8401-2.6624-2.8401-0.678%200-1.2816%200.1819-1.7529%200.51676-0.1571%200.11162-0.37207%200.0041-0.37207-0.18604%200-0.12816-0.10335-0.23564-0.23564-0.23564h-1.3064c-0.12816%200-0.23564%200.10335-0.23564%200.23564v5.9531c0%200.12816%200.10335%200.23564%200.23564%200.23564h1.3932c0.12816%200%200.23151-0.10335%200.23151-0.23151v-0.34726c0-2.5962-1.3725-4.5393-0.01654-4.7956%201.2402-0.23564%202.65-0.12402%202.6665%200.83096%200%200.08268%200.0124%200.33073%200.35553%200.46302%200.20671%200.08268%200.5209%200.10749%200.93431%200.09922%200%200%200.3762-0.02894%200.3762%200.3514%200%200.47542-0.84336%200.44235-0.84336%200.44235-0.27699%200.0124-0.93431-0.06201-1.3105%200.04961-0.19844%200.06201-0.37207%200.17363-0.47542%200.3762-0.17363%200.34313-0.25632%201.0955-0.26872%201.881v0.64079c0%200.12816%200.10335%200.23564%200.23564%200.23564h2.8112c0.12816%200%200.23564-0.10335%200.23564-0.23564v-3.4396z%22%20fill%3D%22%23fff%22%2F%3E%0A%3Cpath%20class%3D%22st2%22%20d%3D%22m99.082%2021.197c-0.1819-0.50436-0.57878-0.90124-1.0831-1.0831-0.45889-0.14469-0.88884-0.14469-1.7446-0.14469h-2.5797c-0.85576%200-1.2857%200-1.7446%200.14469-0.50436%200.1819-0.90124%200.57878-1.0831%201.0831-0.14469%200.46302-0.14469%200.88884-0.14469%201.7446v2.5838c0%200.85576%200%201.2857%200.14469%201.7446%200.1819%200.50436%200.57878%200.90124%201.0831%201.0831%200.46302%200.14469%200.88884%200.14469%201.7446%200.14469h2.5838c0.85576%200%201.2857%200%201.7446-0.14469%200.50436-0.1819%200.90124-0.57878%201.0831-1.0831%200.14469-0.45889%200.14469-0.88884%200.14469-1.7446v-2.5838c0-0.85576%200-1.2857-0.14883-1.7446zm-0.93018%206.2094h-2.8112c-0.12816%200-0.23564-0.10335-0.23564-0.23564v-0.64079c0.0124-0.78548%200.09509-1.5379%200.26872-1.881%200.10335-0.20671%200.27698-0.31833%200.47542-0.3762%200.37207-0.11162%201.0294-0.03721%201.3105-0.04961%200%200%200.84336%200.03307%200.84336-0.44235%200-0.38447-0.3762-0.3514-0.3762-0.3514-0.41341%200.0124-0.73174-0.01654-0.93431-0.09922-0.34313-0.13643-0.35553-0.38034-0.35553-0.46302-0.01654-0.95498-1.4263-1.0707-2.6665-0.83096-1.356%200.25632%200.01654%202.2035%200.01654%204.7956v0.34726c-0.0041%200.12816-0.10335%200.23151-0.23151%200.23151h-1.3973c-0.12816%200-0.23564-0.10335-0.23564-0.23564v-5.9531c0-0.12816%200.10335-0.23564%200.23564-0.23564h1.3105c0.12816%200%200.23564%200.10335%200.23564%200.23564%200%200.1943%200.21497%200.29766%200.37207%200.18604%200.47129-0.339%201.0749-0.51676%201.7529-0.51676%201.5172%200%202.6624%200.8847%202.6624%202.8401v3.4396c-0.0041%200.13229-0.10749%200.23564-0.23978%200.23564zm-3.2825-4.3739c0-0.27699%200.22324-0.50023%200.50023-0.50023s0.50436%200.22324%200.50436%200.50023-0.22324%200.50023-0.50023%200.50023-0.50436-0.21911-0.50436-0.50023z%22%20fill%3D%22%23662482%22%20fill-opacity%3D%22.45%22%2F%3E%0A%3C%2Fg%3E%0A%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A");
    background-repeat: no-repeat;
    background-position: right 10px top 10px;
    background-size: 40px;
  }

  nostr-embed-content {
    width: 100%;
  }

  .recursive {
    width: 95%;
    background-image: unset;
  }
</style>

<script>
  import { SimplePool } from 'nostr-tools/pool';
  import { nip19 } from 'nostr-tools';
  import { relays } from './config.js'
  

  export let noteId; // Accept noteId as a prop
  export let recursive;

  let nostrEvent = null;
  let error = null;


  async function getNote(realNoteId) {
    let noteIdHex;
    let noteRelays = relays;
    if (/^(nevent)/.test(realNoteId)) {
      try {
        const { type, data } = nip19.decode(realNoteId);
        if (type === 'nevent') {
          noteIdHex = data.id;
          noteRelays = [...new Set([...relays ,...data.relays])];
        }
      } catch (error) {
        console.error('Failed to decode note ID:', error);
        return null;
      }
    } else if (realNoteId.length === 64) {
      noteIdHex = realNoteId;
    } else {
      console.error('Invalid code format');
      return null;
    }
    
    
    
    const pool = new SimplePool();
    let rawNostrEvent = await pool.get(noteRelays, {
      ids: [noteIdHex],
    });
    rawNostrEvent.content = await processUsersEntities(rawNostrEvent.content);
    rawNostrEvent.content = await processEvents(rawNostrEvent.content);

    let created_atDate = new Date();
    created_atDate.setTime(rawNostrEvent.created_at*1000);

    rawNostrEvent.created_at = created_atDate.toUTCString();
    nostrEvent = await rawNostrEvent;
    //console.log(nostrEvent);
    
  }

  async function processUsersEntities(content) {
  if (content == undefined) {
    return
  }
  const regexPrefixedEntities = /nostr:(npub1\w+|nprofile1\w+)/g;
  const matches = content.match(regexPrefixedEntities) || [];

  const replacementPromises = matches.map(async (match) => {
      return { match, replacement: "<nostr-embed-mention pubkey='"+match.slice(6)+"'></nostr-embed-mention>" }; // Fallback to original match
    });

  const replacements = await Promise.all(replacementPromises);
  let processedContent = content;
  replacements.forEach(({ match, replacement }) => {
    processedContent = processedContent.replace(match, replacement);
  });

  return processedContent;
}

async function processEvents(content) {
  if (content == undefined) {
    return
  }
  const regexPrefixedEntities = /nostr:(nevent\w+)/g;
  const matches = content.match(regexPrefixedEntities) || [];

  const replacementPromises = matches.map(async (match) => {
      return { match, replacement: "<nostr-embed recursive='true' note-id='"+match.slice(6)+"'></nostr-embed>" }; // Fallback to original match
    });

  const replacements = await Promise.all(replacementPromises);
  let processedContent = content;
  replacements.forEach(({ match, replacement }) => {
    processedContent = processedContent.replace(match, replacement);
  });

  return processedContent;
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
    <nostr-embed-wrap class:recursive={recursive}>
      <nostr-embed-author pubkey={nostrEvent.pubkey}></nostr-embed-author>
      <nostr-embed-content>{@html nostrEvent.content}</nostr-embed-content>
      <nostr-embed-timestemp>{nostrEvent.created_at}</nostr-embed-timestemp>
    </nostr-embed-wrap>  
{:else}
  <p>Loading...</p>
{/if}


