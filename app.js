const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

let database;
const dbPath = path.join(__dirname, "twitterClone.db");

const initDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localstorage:3000/");
    });
  } catch (e) {
    console.log(`Database error: ${e.message}`);
    process.exit(1);
  }
};

initDbAndServer();

//API 1:
app.post("/register/", async (request, response) => {
  try {
    const { username, password, name, gender } = request.body;
    let checkUser;
    checkUser = `
        SELECT *
        FROM USER
        WHERE username like '${username}'`;
    const user = await database.get(checkUser);
    if (user === undefined) {
      if (password.length < 6) {
        response.status(400);
        response.send("Password is too short");
      } else {
        const encryPassword = await bcrypt.hash(password, 10);
        const postUserSql = `
                INSERT INTO user(name,username,password,gender)
                VALUES('${name}','${username}','${encryPassword}','${gender}');`;
        await database.run(postUserSql);
        response.send("User created successfully");
      }
    } else {
      response.status(400);
      response.send("User already exists");
    }
  } catch (e) {
    console.log(e.message);
  }
});
// Middleware
const checkPassword = async (request, response, next) => {
  try {
    const { username, password } = request.body;
    let user;
    const checkUserSql = `
        SELECT *
        FROM USER
        WHERE username = '${username}'`;
    user = await database.get(checkUserSql);
    if (user === undefined) {
      response.status(400);
      response.send("Invalid user");
    } else {
      const isPasswordCorrect = await bcrypt.compare(password, user.password);
      if (isPasswordCorrect) {
        request.user = user;
        next();
      } else {
        response.status(400);
        response.send("Invalid password");
      }
    }
  } catch (e) {
    console.log(e.message);
  }
};
//API 2:
app.post("/login/", checkPassword, async (request, response) => {
  try {
    const token = jwt.sign(request.user, "Secret Key");
    response.send({
      jwtToken: token,
    });
  } catch (e) {
    console.log(e.message);
  }
});
// Middleware
const authorization = async (request, response, next) => {
  try {
    let token;
    const authHead = request.headers["authorization"];
    if (authHead !== undefined) {
      token = authHead.split(" ")[1];
    }
    if (token !== undefined) {
      await jwt.verify(token, "Secret Key", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.user = payload;
          next();
        }
      });
    } else {
      response.status(401);
      response.send("Invalid JWT Token");
    }
  } catch (e) {
    console.log(e.message);
  }
};
//API 3: Get tweets
app.get("/user/tweets/feed/", authorization, async (request, response) => {
  try {
    const username = request.user;
    const getTweetsSql = `SELECT  username,tweet,date_time as dateTime
        FROM follower 
            LEFT JOIN tweet on tweet.user_id= follower.following_user_id
            LEFT JOIN user ON user.user_id=tweet.user_id
        WHERE  follower.follower_user_id = ${username.user_id}
        ORDER BY tweet.date_time desc
        limit 4`;
    const tweets = await database.all(getTweetsSql);
    response.send(tweets);
  } catch (e) {
    console.log(e.message);
  }
});

//API 4:
app.get("/user/following/", authorization, async (request, response) => {
  try {
    const user = request.user;
    const getFollowingSql = `
        SELECT user.name as name
        FROM follower LEFT join 
        user ON user.user_id= follower.following_user_id
        WHERE follower.follower_user_id =${user.user_id}`;
    const getFollowing = await database.all(getFollowingSql);
    response.send(getFollowing);
  } catch (e) {
    console.log(e.message);
  }
});

//API 5:
app.get("/user/followers/", authorization, async (request, response) => {
  try {
    const user = request.user;
    const getFollowingSql = `
        SELECT user.name as name
        FROM follower LEFT join 
        user ON user.user_id= follower.follower_user_id
        WHERE follower.following_user_id =${user.user_id}`;
    const getFollowing = await database.all(getFollowingSql);
    response.send(getFollowing);
  } catch (e) {
    console.log(e.message);
  }
});

//Middleware
const checkFollowing = async (request, response, next) => {
  try {
    const user = request.user;
    const { tweetId } = request.params;
    const tweetsQuery = `
       SELECT
       *
       FROM tweet
       WHERE tweet_id=${tweetId}
    `;
    const tweetResult = await database.get(tweetsQuery);
    const userFollowersQuery = `
       SELECT
       *
       FROM follower INNER JOIN user on user.user_id = follower.following_user_id
       WHERE follower.follower_user_id = ${user.user_id};`;
    const userFollowers = await database.all(userFollowersQuery);

    if (
      userFollowers.some(
        (item) => item.following_user_id == tweetResult.user_id
      )
    ) {
      next();
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  } catch (e) {
    console.log(e.message);
  }
};

//API 6
app.get(
  "/tweets/:tweetId/",
  authorization,
  checkFollowing,
  async (request, response) => {
    try {
      const user = request.user;
      let tweet;
      const { tweetId } = request.params;
      const checkTweetSql = `
        SELECT tweet.tweet as tweet,
            count(like.like_id) as likes,
            count(reply.reply_id) as replies,
            tweet.date_time as dateTime
        FROM  tweet          
            INNER JOIN like ON like.tweet_id= tweet.tweet_id
            INNER JOIN reply ON tweet.tweet_id= reply.tweet_id
        WHERE tweet.tweet_id = ${tweetId};`;
      tweet = await database.get(checkTweetSql);
      response.send(tweet);
    } catch (e) {
      console.log(e.message);
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes",
  authorization,
  checkFollowing,
  async (request, response) => {
    try {
      const user = request.user;
      let tweet;
      const { tweetId } = request.params;
      const checkTweetSql = `
          SELECT distinct(user.username) as username
          FROM  tweet 
            INNER JOIN like ON like.tweet_id= tweet.tweet_id
            INNER JOIN user ON user.user_id= like.user_id
          WHERE tweet.tweet_id = ${tweetId}
            follower.follower_user_id=${user.user_id};`;
      tweet = await database.all(checkTweetSql);
      let result = [];
      tweet.forEach((element) => {
        result.push(element.username);
      });
      response.send({
        likes: result,
      });
    } catch (e) {
      console.log(e.message);
    }
  }
);

//API 8:
app.get(
  "/tweets/:tweetId/replies",
  authorization,
  checkFollowing,
  async (request, response) => {
    try {
      const user = request.user;
      let tweet;
      const { tweetId } = request.params;
      const checkTweetSql = `
          SELECT u.username as name, r.reply as reply
          FROM reply r 
            INNER JOIN tweet t ON r.tweet_id = t.tweet_id 
            INNER JOIN user u ON r.user_id = u.user_id 
            WHERE  t.tweet_id=${tweetId};`;
      tweet = await database.all(checkTweetSql);
      response.send({
        replies: tweet,
      });
    } catch (e) {
      console.log(e.message);
    }
  }
);

//API 9:
app.get("/user/tweets/", authorization, async (request, response) => {
  try {
    const user = request.user;
    const getTweetSql = `
        SELECT t.tweet as tweet, COUNT(l.like_id) as num_likes, COUNT(r.reply_id) as num_replies, t.date_time
    FROM tweet t
    inner JOIN like l ON t.tweet_id = l.tweet_id
    inner JOIN reply r ON t.tweet_id = r.tweet_id
    WHERE t.user_id = ${user.user_id}
    GROUP BY t.tweet_id;
        `;
    const tweets = await database.all(getTweetSql);
    response.send(tweets);
  } catch (e) {
    console.log(`${e.message}`);
  }
});

//API 10 :
app.post("/user/tweets/", authorization, async (request, response) => {
  try {
    const { tweet } = request.body;
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    const user = request.user;
    const postTweetSql = `
        INSERT INTO tweet(tweet,user_id,date_time)
        VALUES('${tweet}',${parseInt(user.user_id)},"${dateStr}")`;
    await database.run(postTweetSql);
    response.send("Created a Tweet");
  } catch (e) {
    console.log(e.message);
  }
});
// Middleware
const checkOwner = async (request, response, next) => {
  try {
    const user = request.user;
    const { tweetId } = request.params;
    const getOwner = await database.get(
      `SELECT user_id FROM tweet WHERE tweet_id=${tweetId}`
    );
    if (getOwner !== undefined && getOwner.user_id == user.user_id) {
      next();
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  } catch (e) {
    console.log(e.message);
  }
};
//API 11:
app.delete(
  "/tweets/:tweetId/",
  authorization,
  checkOwner,
  async (request, response) => {
    try {
      const { tweetId } = request.params;
      await database.run(`DELETE FROM tweet WHERE tweet_id =${tweetId}`);
      response.send("Tweet Removed");
    } catch (e) {
      console.log(e.message);
    }
  }
);

module.exports = app;
