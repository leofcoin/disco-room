import Channel from 'ipfs-pubsub-1on1';
import PeerMonitor from 'ipfs-pubsub-peer-monitor';

export default class DiscoRoom extends PeerMonitor {
  /**
   * @param {object} ipfs - ipfs api
   * @param {array} space - ['directory', 'multihash', 'label']
   * @param {string} id - optional
   */
  constructor(ipfs, topic) {
    super(ipfs.pubsub, topic)
    this.ipfs = ipfs;

    this.topic = topic;
    this.peers = [];    
    
    ipfs.pubsub.subscribe(topic, (message) => {
      message.data = message.data.toString();
      console.log(message);
      super.emit('message', message);
    }, (err, res) => {});
    
    this._peerJoined = this._peerJoined.bind(this);
    this._peerLeft = this._peerLeft.bind(this);
    this._subscribed = this._subscribed.bind(this);
    
    this._init();
    
    // this.ipfs.id().then(({ id }) => {
    // this.broadcast(JSON.stringify({type: 'joining', from: id}))  
    // })
    
  }
  
  async _init() {  
    const { id } = await this.ipfs.id();
    this.id = id;
    
    this.on('join', this._peerJoined);
    this.on('leave', this._peerLeft);
    this.on('error', error => console.error(error))
    this.on('subscribed', this._subscribed);
  }


  async broadcast(data) {
    await this.ipfs.pubsub.publish(this.topic, Buffer.from(data))
  }

  _subscribed() {
    this.subscribed = true;
  }

  _peerJoined(peer) {
    console.log(peer);
    this.whisper(peer, {type: 'connect', data: this.peers})
    if (this.peers.indexOf(peer) === -1) this.peers.push(peer);
    
    // this.whisper(peer)
  }

  _peerLeft(peer) {
    this.peers.splice(this.peers.indexOf(peer), 1)
  }

  async whisper(peerID, event) {    
    event.from = peerID;
    peerID = `/ipfs/${peerID}`;
    const channel = await Channel.open(this.ipfs, peerID);
    await channel.connect();
    channel.on('message', async (message) => {
      if (message.from !== this.id) {
        if (message.type === 'join') {
          const index = message.data.indexOf(this.id)
          if (index !== -1) message.data.splice(index, 1);
          this.ipfs.swarm.connect(message.data);
          channel.close();
        } else {
          await this.whisper(message.from, { type: 'join', from: this.id, data: this.peers});
          channel.close();
        }
      }
    })
    return channel.emit('message', event)
  }
}
