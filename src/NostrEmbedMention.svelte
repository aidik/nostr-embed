<svelte:options
	customElement={{
		tag: 'nostr-embed-mention',
		props: {
			pubkey: { attribute: 'pubkey' }
		}
	}}
/>

<style>


</style>

<script>
  import { SimplePool } from 'nostr-tools/pool';
  import { nip19 } from 'nostr-tools';
  import { relays } from './config.js'
  

  export let pubkey;

  let nostrAuthor = null;
  let error = null;

  export async function getProfile(code) {
  let publicKey;
  let authorRelays = relays;
  if (/^(nprofile|npub)/.test(code)) {
    try {
      const { type, data } = nip19.decode(code);
      if (type === 'npub') {
        publicKey = data;
      } else if (type === 'nprofile') {
        publicKey = data.pubkey;
        authorRelays = [...new Set([...relays ,...data.relays])];
      }
    } catch (error) {
      console.error('Failed to decode npub:', error);
      return null;
    }
  } else if (code.length === 64) {
    publicKey = code;
  } else {
    console.error('Invalid code format');
    return null;
  }
  const pool = new SimplePool();


  let rawNostrAuthor = await pool.get(authorRelays,
    {
      kinds: [0],
      authors: [publicKey],
      limit: 1,
    }
  );
  rawNostrAuthor.content = JSON.parse(rawNostrAuthor.content);
  nostrAuthor = await rawNostrAuthor
}

if (pubkey) {
  getProfile(pubkey);
} else {
  error = 'Author Pubkey not passed.';
}

</script>

<!-- Component Template -->
{#if error}
  <p style="color: red;">{error}</p>
{:else if nostrAuthor}
  <b>{nostrAuthor.content.display_name || nostrAuthor.content.name}</b>
{:else}
  <b>Mention Loading...</b>
{/if}