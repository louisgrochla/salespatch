// SalesFlow Academy — Training content seed data
// Each unit contains lessons as JSON. Lesson types: editorial, scenario, roleplay, quickfire.

export interface TrainingUnitSeed {
  unit_id: string;
  title: string;
  subtitle: string;
  estimated_minutes: number;
  sort_order: number;
  is_advanced: number;
  lessons_json: string;
}

export const TRAINING_UNITS: TrainingUnitSeed[] = [
  {
    unit_id: 'unit-1',
    title: 'The Basics',
    subtitle: 'What you\'re doing and why it works',
    estimated_minutes: 6,
    sort_order: 1,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u1-l1',
        title: 'What you\'re actually doing',
        content: 'You\'re not a door-to-door salesman. You\'re not cold-calling. You\'re walking into a business with something they genuinely need — a professional website — and it\'s already been built for them.\n\nThe demo site is personalised. It has their business name, their services, their real Google reviews. When they see it, the reaction is almost always surprise. That surprise is your pitch.\n\nYour job is simple: show it to them. The website does the selling. You just need to get it in front of the right person.',
        highlight: 'The website does the selling. You just need to get it in front of the right person.'
      },
      {
        type: 'scenario',
        id: 'u1-l2',
        title: 'The numbers',
        setup: 'You\'re explaining your side gig to a friend at the pub. They ask: "So how does the money work?"',
        options: [
          {
            id: 'a',
            text: '"The business pays £299 for the website and £25 a month after that. I get £50 for every sale, paid weekly. No base pay — it\'s commission only, but I choose my own hours."',
            score: 3,
            feedback: 'Clear, honest, and covers the key points without overselling. This is exactly how you\'d explain it.'
          },
          {
            id: 'b',
            text: '"I sell websites and make £50 each time. It\'s pretty easy money."',
            score: 1,
            feedback: 'Too vague and "easy money" sets the wrong expectation. If it sounds too good to be true, people won\'t take it seriously — including you.'
          },
          {
            id: 'c',
            text: '"It\'s a tech startup. I\'m basically in sales. The commission structure is pretty standard."',
            score: 2,
            feedback: 'Not wrong, but not specific. The strength of this gig is the simplicity — lead with the numbers.'
          }
        ]
      },
      {
        type: 'editorial',
        id: 'u1-l3',
        title: 'Your tools',
        content: 'Everything you need is in this app.\n\n**Lead cards** show you which businesses to visit — with their Google rating, reviews, services, and tips on what to say (and what to avoid).\n\n**The demo viewer** lets you pull up their personalised website and hand your phone to the owner. Full screen, no distractions.\n\n**QR sharing** is your best friend. Whether they say yes or "let me think about it," the QR code puts the demo on their phone. They show their partner, their staff. The website keeps selling after you leave.\n\n**Status updates** track your progress — new, visited, pitched, sold. Your dashboard shows your earnings in real time.',
        highlight: 'The QR code puts the demo on their phone. The website keeps selling after you leave.'
      }
    ])
  },
  {
    unit_id: 'unit-2',
    title: 'Reading the Room',
    subtitle: 'Know before you walk in',
    estimated_minutes: 8,
    sort_order: 2,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u2-l1',
        title: 'Before you walk in',
        content: 'Stand outside for ten seconds. Not creepily — just look.\n\nIs the owner visible, or is it staff only? Is it busy, or quiet enough for a conversation? Is there already a website URL on the window signage?\n\nThese ten seconds save you from walking into the wrong conversation at the wrong time. A salon owner mid-client won\'t give you the time of day. A café owner during the lunch rush will wave you away. But catch that same person at 10:30am on a Tuesday, and you\'ve got their full attention.\n\nTiming is half the job.',
        highlight: 'Timing is half the job.'
      },
      {
        type: 'quickfire',
        id: 'u2-l2',
        title: 'Walk in or walk past?',
        prompt: 'Quick decisions. Trust your gut.',
        items: [
          { id: 'qf1', situation: 'Barber shop, 11am Tuesday. Owner is sweeping the floor between clients.', answer: 'stay', reason: 'Perfect timing — they\'re free and in their space.' },
          { id: 'qf2', situation: 'Busy takeaway, 6:30pm Friday. Queue out the door.', answer: 'go', reason: 'Peak hours. Come back Tuesday morning.' },
          { id: 'qf3', situation: 'Nail salon, 2pm. Owner is at reception, one client in a chair.', answer: 'stay', reason: 'Quiet enough for a conversation. They can multitask.' },
          { id: 'qf4', situation: 'Café with "No Cold Callers" sign on the door.', answer: 'go', reason: 'Respect the sign. Drop a QR code flyer instead, or try email.' },
          { id: 'qf5', situation: 'Estate agent, 3pm. Two staff behind desks, no customers visible.', answer: 'go', reason: 'Estate agents are franchises or chains — not your target. They have corporate websites.' },
          { id: 'qf6', situation: 'Independent florist, 10am Wednesday. Owner is arranging a window display.', answer: 'stay', reason: 'Independent business, quiet time, owner is present. Ideal.' }
        ]
      },
      {
        type: 'scenario',
        id: 'u2-l3',
        title: 'Using your intel',
        setup: 'You have time for one more pitch today. Two leads are nearby:\n\n**Lead A**: "Blooms Florist" — 4.8★ (57 reviews), family run 12 years, RHS award winner. Owner: Claire.\n\n**Lead B**: "Crunch Gym" — 3.9★ (62 reviews), no contact person listed, recent equipment complaints in reviews.\n\nWhich do you visit?',
        options: [
          {
            id: 'a',
            text: 'Lead A — Blooms Florist. High rating, long-established, owner identified, positive reputation.',
            score: 3,
            feedback: 'Strong choice. Claire cares about her brand (12 years, RHS award). She\'ll appreciate seeing it reflected in a professional website. The trust signals make the pitch easier.'
          },
          {
            id: 'b',
            text: 'Lead B — Crunch Gym. Lower rating means they might need more help with their online presence.',
            score: 1,
            feedback: 'Logical thinking, but a business with complaints and no identified owner is a harder sell. You\'d be pitching uphill. Save your energy for businesses that already care about their reputation.'
          },
          {
            id: 'c',
            text: 'Neither — call it a day and start fresh tomorrow.',
            score: 2,
            feedback: 'Not wrong — energy matters. But Lead A is a strong prospect and you\'re already nearby. One more pitch could be £50.'
          }
        ]
      },
      {
        type: 'editorial',
        id: 'u2-l4',
        title: 'When to walk away',
        content: 'Not every door is worth opening.\n\nIf the owner is hostile — arms crossed, "not interested" before you\'ve finished your sentence — thank them and leave. Never argue. Never push. You\'re not changing their mind today, and the 30 seconds you save is 30 seconds closer to someone who will say yes.\n\nIf they\'re clearly mid-rush, say "I can see you\'re busy — mind if I pop back tomorrow?" That shows respect. They\'ll remember you differently.\n\nIf there\'s a brand-new website on display behind the counter — just leave. They solved this problem already.\n\nTime spent on a dead lead is time not spent on a live one.',
        highlight: 'Time spent on a dead lead is time not spent on a live one.'
      }
    ])
  },
  {
    unit_id: 'unit-3',
    title: 'Your First Words',
    subtitle: 'The opener that works',
    estimated_minutes: 5,
    sort_order: 3,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u3-l1',
        title: 'The opener',
        content: '"Hi, I\'m [your name] — I work with a company that builds websites for local businesses. I\'ve actually got one here that was made for yours — can I show you?"\n\nThirteen seconds. The key is the last five words: "can I show you?" You\'re not asking for a meeting. You\'re not asking for money. You\'re asking for thirty seconds of their attention.\n\nMost people say yes to thirty seconds. And once they see their business name on a professional website — on your phone, right in front of them — the conversation starts itself.',
        highlight: '"Can I show you?" — you\'re asking for thirty seconds, not a purchase.'
      },
      {
        type: 'roleplay',
        id: 'u3-l2',
        title: 'The first conversation',
        messages: [
          { role: 'owner', text: 'Yeah, what is it? I\'m a bit busy.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: 'I totally understand — I\'ll be quick. I work with a company that builds websites for local businesses, and we\'ve actually made one for yours. Can I show you? It\'ll take 20 seconds.', score: 3 },
              { id: 'b', text: 'Sorry to bother you. I\'m selling websites, do you have a minute?', score: 1 },
              { id: 'c', text: 'No worries, I can come back. When\'s a good time?', score: 2 }
            ]
          },
          { role: 'owner', text: 'Alright, go on then. Quick though.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: '*Hands phone over* This is your business. Everything here — the services, the reviews, the layout — it\'s all based on your actual business. Have a scroll.', score: 3 },
              { id: 'b', text: 'So basically we build affordable websites for small businesses. The package includes hosting, domain, everything. It\'s £299 upfront...', score: 1 },
              { id: 'c', text: '*Shows phone screen* We built this demo site for you. It\'s got your name and services on it. What do you think?', score: 2 }
            ]
          }
        ]
      },
      {
        type: 'editorial',
        id: 'u3-l3',
        title: 'Reading their reaction',
        content: 'In the first ten seconds after they see the demo, you\'ll get one of three reactions.\n\n**Interested**: They lean in. They scroll. They ask questions — "How did you get my reviews on here?" Keep going. Answer their questions. Don\'t rush to the price.\n\n**Polite**: They nod but don\'t engage much. "Yeah, that\'s nice." You have about thirty more seconds. Point out something specific: "See how it pulls in your real Google reviews?" Give them a reason to care.\n\n**Hostile**: Arms crossed. "Not interested." Thank them and leave. Say "No problem — I\'ll leave this QR code in case you change your mind." Leave the QR. Never argue.\n\nThe demo does the heavy lifting. Your job is to read the room and respond accordingly.',
        highlight: 'The demo does the heavy lifting. Your job is to read the room and respond accordingly.'
      }
    ])
  },
  {
    unit_id: 'unit-4',
    title: 'The Demo Moment',
    subtitle: 'Let the website sell itself',
    estimated_minutes: 5,
    sort_order: 4,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u4-l1',
        title: 'Let it speak for itself',
        content: 'This is the most important moment in the pitch, and your job during it is to do almost nothing.\n\nHand them the phone. Don\'t hold it up and describe things. Don\'t point at the screen. Hand it over. Let them hold it, scroll it, see their own business name at the top of a professional website.\n\nThe moment they see their business name, their services, their actual Google reviews on a site that looks better than anything they\'ve seen — that\'s the pitch. Shut up for five seconds and let them react.\n\nTheir reaction tells you everything about where this conversation is going.',
        highlight: 'Shut up for five seconds and let them react.'
      },
      {
        type: 'scenario',
        id: 'u4-l2',
        title: 'What to point out',
        setup: 'The owner has been scrolling the demo for about 15 seconds. They look interested but haven\'t said anything yet. What do you say?',
        options: [
          {
            id: 'a',
            text: '"See how it pulls in your real Google reviews? And this is how it looks on mobile — which is how about 70% of your customers would find you."',
            score: 3,
            feedback: 'Perfect. You\'re highlighting value (social proof + mobile-first) without being pushy. You\'re letting them discover the quality.'
          },
          {
            id: 'b',
            text: '"So, shall I explain the pricing? It\'s £299 upfront and £25 a month."',
            score: 1,
            feedback: 'Way too early. They haven\'t even reacted to the demo yet. Jumping to price before they\'re sold on value is the fastest way to hear "too expensive."'
          },
          {
            id: 'c',
            text: '"Everything here is specific to your business — nothing generic. We built this from your actual online presence."',
            score: 2,
            feedback: 'Good point, but slightly vague. Be specific — point to the reviews, the services list, the mobile layout. Concrete beats abstract.'
          }
        ]
      },
      {
        type: 'editorial',
        id: 'u4-l3',
        title: 'The QR handoff',
        content: 'Whether they say yes or "let me think about it," the QR code is your best friend.\n\nThey scan it. The demo stays on their phone. They show their partner that evening. Their staff see it the next morning. Their friend who "knows about websites" takes a look.\n\nThe website sells for you when you\'re not there.\n\nAlways leave the QR code. Even on a hard no. "No problem at all — I\'ll leave this in case you change your mind. It\'s a live preview of what your site could look like." Some of your best sales will come from QR codes left on counters three days earlier.',
        highlight: 'Some of your best sales will come from QR codes left on counters three days earlier.'
      }
    ])
  },
  {
    unit_id: 'unit-5',
    title: 'When They Say No',
    subtitle: 'The objections you\'ll hear and what to say',
    estimated_minutes: 10,
    sort_order: 5,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u5-l1',
        title: 'Objections aren\'t rejection',
        content: 'When someone says "it\'s too expensive" or "I need to think about it," they\'re not saying no. They\'re saying "convince me."\n\nThe difference between a good salesperson and a great one is what happens in the next ten seconds. A good one accepts the objection. A great one has a response ready — not pushy, not scripted, just a calm, honest answer that addresses the real concern.\n\nYou\'ll hear the same five or six objections over and over. Once you know them, they stop being scary. They become opportunities.',
        highlight: 'Once you know them, they stop being scary. They become opportunities.'
      },
      {
        type: 'roleplay',
        id: 'u5-l2',
        title: '"We already have a website"',
        messages: [
          { role: 'owner', text: 'We\'ve already got a website actually.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: 'That\'s great — can I show you what a modern version could look like? Just for comparison. No pressure.', score: 3 },
              { id: 'b', text: 'When was it last updated? A lot of older sites don\'t work well on mobile.', score: 2 },
              { id: 'c', text: 'Oh right, sorry to bother you then.', score: 1 }
            ]
          },
          { role: 'owner', text: 'I suppose you can show me. Make it quick.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: '*Hands phone* This is what we built for you. Have a scroll — see how it looks on mobile, pulls in your real reviews, lists your actual services.', score: 3 },
              { id: 'b', text: 'Our websites are much better than most. We use AI to generate them.', score: 1 }
            ]
          }
        ]
      },
      {
        type: 'roleplay',
        id: 'u5-l3',
        title: '"It\'s too expensive"',
        messages: [
          { role: 'owner', text: 'Three hundred and fifty quid? That\'s a lot of money.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: 'I get that. But that covers everything — hosting, domain, maintenance, updates. It works out to less than a pound a day. And there\'s no contract, so if it doesn\'t work for you, you can cancel anytime.', score: 3 },
              { id: 'b', text: 'Most web agencies charge £2,000 or more for something like this. £299 is actually very competitive.', score: 2 },
              { id: 'c', text: 'I could see if there\'s a discount available?', score: 1 }
            ]
          }
        ]
      },
      {
        type: 'roleplay',
        id: 'u5-l4',
        title: '"We just use Facebook"',
        messages: [
          { role: 'owner', text: 'We just use Facebook and Instagram. Don\'t really need a website.' },
          {
            role: 'you',
            options: [
              { id: 'a', text: 'Social media is great for engagement. But a website means you own your online presence. If Instagram changes their algorithm tomorrow — and they do, regularly — your website is still there. And when someone Googles "florist near me," they find websites, not Facebook pages.', score: 3 },
              { id: 'b', text: 'Facebook isn\'t really enough anymore. Everyone has a website now.', score: 1 },
              { id: 'c', text: 'A website and social media actually work together really well. The website gives people somewhere to land when they find you on Google.', score: 2 }
            ]
          }
        ]
      },
      {
        type: 'scenario',
        id: 'u5-l5',
        title: '"I need to think about it"',
        setup: 'The owner has seen the demo, asked a few questions, and seemed interested. Now they say: "Look, it\'s nice, but I need to think about it. Can you come back next week?"',
        options: [
          {
            id: 'a',
            text: '"Completely understand. I\'ll leave you this QR code so you can look at the demo whenever you like — show it to your partner or staff if you want. I\'ll pop back Thursday. Does morning or afternoon work better?"',
            score: 3,
            feedback: 'Perfect. You respected their decision, left the QR (so the site keeps selling), and locked in a specific follow-up. Thursday is soon enough to maintain momentum without being pushy.'
          },
          {
            id: 'b',
            text: '"Sure, no problem. Here\'s my number if you decide."',
            score: 1,
            feedback: 'Too passive. You\'re putting the ball entirely in their court. They won\'t call. You need to set the follow-up, not hope for one.'
          },
          {
            id: 'c',
            text: '"What specifically do you need to think about? Maybe I can help answer any questions now."',
            score: 2,
            feedback: 'Can work, but feels slightly pushy. If they\'ve said they need to think, pressing for specifics can feel like you\'re not listening.'
          }
        ]
      }
    ])
  },
  {
    unit_id: 'unit-6',
    title: 'Closing',
    subtitle: 'The ask, the handoff, the follow-up',
    estimated_minutes: 5,
    sort_order: 6,
    is_advanced: 0,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u6-l1',
        title: 'The ask',
        content: '"Would you like to go ahead?"\n\nFive words. No tricks. No manufactured urgency. No "special offer if you sign today." Just a direct, respectful question.\n\nIf they say yes: you send them the payment link. The website goes live within 24 hours. Your £50 is confirmed.\n\nIf they say no: leave the QR code and set a follow-up. "No problem. I\'ll leave this so you can take another look. Mind if I pop back in a few days?"\n\nIf they say maybe: that\'s a follow-up, not a no. Set a date. Be specific. "How about Thursday morning?"',
        highlight: '"Would you like to go ahead?" Five words. No tricks.'
      },
      {
        type: 'editorial',
        id: 'u6-l2',
        title: 'After the sale',
        content: 'When they say yes:\n\n1. Send the payment link (in the app — one tap)\n2. Update the lead status to "sold"\n3. The business gets their live website within 24 hours\n4. Your £50 commission is confirmed within 7 days\n5. Move to the next lead\n\nThat\'s it. The platform handles everything else — hosting, domain, SSL, deployment. You don\'t need to follow up on the technical side.\n\nBefore you leave, one more thing...',
        highlight: 'The platform handles everything else. You just close and move on.'
      },
      {
        type: 'scenario',
        id: 'u6-l3',
        title: 'The referral',
        setup: 'You\'ve just closed a sale with Marcus at Barber & Co. He\'s happy, payment is done. Before you leave, what do you say?',
        options: [
          {
            id: 'a',
            text: '"Thanks Marcus. Quick question — do you know any other business owners around here who might be interested? Doesn\'t have to be barbers — anyone who could use a website."',
            score: 3,
            feedback: 'Perfect. Natural, not pushy, and timed right — they\'re in a positive mood after buying. Referral leads have the highest conversion rate of anything.'
          },
          {
            id: 'b',
            text: '"Cheers Marcus, pleasure doing business. If you know anyone, send them my way!"',
            score: 2,
            feedback: 'Friendly but vague. "Send them my way" rarely leads to action. Be specific: ask if they know anyone, right now, by name.'
          },
          {
            id: 'c',
            text: 'Nothing — you\'ve got the sale, time to move on.',
            score: 1,
            feedback: 'Missed opportunity. The 10 seconds it takes to ask for a referral could be worth another £50. Always ask.'
          }
        ]
      }
    ])
  },
  {
    unit_id: 'unit-7',
    title: 'Working Smarter',
    subtitle: 'Turn pitching into a system',
    estimated_minutes: 6,
    sort_order: 7,
    is_advanced: 1,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u7-l1',
        title: 'Plan your route',
        content: 'The difference between earning £50 a week and £300 is not talent — it\'s efficiency.\n\nBefore you head out, look at your leads on the map. Cluster them geographically. Plan a walking route that hits 8-12 businesses in a single session. Don\'t zigzag across town — work one street, one area, one postcode at a time.\n\nThe best hours to pitch are 10am-12pm and 2pm-4pm. Before 10, owners are setting up. Between 12-2, they\'re in the lunch rush. After 4, they\'re winding down. Hit the sweet spots.\n\nA focused 3-hour session beats a scattered 6-hour day, every time.',
        highlight: 'A focused 3-hour session beats a scattered 6-hour day, every time.'
      },
      {
        type: 'editorial',
        id: 'u7-l2',
        title: 'The numbers game',
        content: 'Here\'s the reality of sales, broken down honestly:\n\nOf every 10 doors you walk into, roughly 6-7 will be a clear no. 2-3 will be a "maybe" or a follow-up. 1 will say yes.\n\nThat means a 10% close rate — which is actually good for walk-in sales. At £50 per sale, 10 pitches is £50. Do that three times a week and you\'re earning £150/week — £600/month from roughly 12 hours of work.\n\nThe contractors who earn £300+ per week aren\'t better at pitching. They just pitch more. They hit 10-15 businesses per session instead of 4-5.',
        highlight: 'The contractors who earn £300+ per week aren\'t better at pitching. They just pitch more.'
      }
    ])
  },
  {
    unit_id: 'unit-8',
    title: 'Building Territory',
    subtitle: 'Become the person they know',
    estimated_minutes: 8,
    sort_order: 8,
    is_advanced: 1,
    lessons_json: JSON.stringify([
      {
        type: 'editorial',
        id: 'u8-l1',
        title: 'Social proof loops',
        content: 'Once you\'ve sold to one business on a street, you have the most powerful tool in sales: social proof.\n\n"I just set up the barber two doors down last week — they\'re really happy with it."\n\nThat single sentence transforms you from a stranger selling something into a known quantity. The business owner can literally walk next door and verify your claim. This is why working a territory — the same streets, the same area — compounds over time.\n\nBy your third or fourth sale in an area, businesses start coming to you. "Oh, you\'re the website person — Marcus mentioned you."',
        highlight: 'By your third or fourth sale in an area, businesses start coming to you.'
      },
      {
        type: 'scenario',
        id: 'u8-l2',
        title: 'The revisit',
        setup: 'Three days ago, you pitched to Priya at The Rusty Spoon café. She said "let me think about it." You left a QR code. Now you\'re back in the area. What do you do?',
        options: [
          {
            id: 'a',
            text: 'Pop in casually. "Hi Priya, just passing through — did you get a chance to look at the demo? No pressure either way."',
            score: 3,
            feedback: 'Perfect. Low pressure, personalised (you remembered her name), and you\'re giving her an easy opening to say yes or ask questions.'
          },
          {
            id: 'b',
            text: 'Skip it. She said she\'d think about it — if she was interested, she\'d have called.',
            score: 1,
            feedback: 'Most people won\'t call. Follow-ups are where a huge percentage of sales happen. The fact that she didn\'t say no is encouraging.'
          },
          {
            id: 'c',
            text: 'Send a text message instead of going in person.',
            score: 2,
            feedback: 'Texts work, but in-person follow-ups are stronger. If you\'re already in the area, pop in. It takes 30 seconds and shows you care.'
          }
        ]
      }
    ])
  }
];
