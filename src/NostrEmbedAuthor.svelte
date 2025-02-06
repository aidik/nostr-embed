<svelte:options
	customElement={{
		tag: 'nostr-embed-author',
		props: {
			pubkey: { attribute: 'pubkey' }
		}
	}}
/>

<style>
  nostr-embed-author-wrap {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
  }

  nostr-embed-author-picture {
    width: 60px;
    height: 60px;
    margin-right: 10px;
  }

  nostr-embed-author-picture img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  nostr-embed-author-content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: nowrap;
  }

  nostr-embed-author-name {
    font-size: x-large;
    font-weight: 700;
  }

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
<nostr-embed-author-wrap>
  <nostr-embed-author-picture><img alt="{nostrAuthor.content.display_name}" src="{nostrAuthor.content.picture}" /></nostr-embed-author-picture>
  <nostr-embed-author-content>
    <nostr-embed-author-name>{nostrAuthor.content.display_name || nostrAuthor.content.name}</nostr-embed-author-name>
    <nostr-embed-author-nip05>{nostrAuthor.content.nip05}</nostr-embed-author-nip05>
  </nostr-embed-author-content>
</nostr-embed-author-wrap>
{:else}
  <p>Author Loading...</p>
{/if}